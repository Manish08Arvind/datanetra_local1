#!/usr/bin/env python3
"""
Prophet-based sales forecast for retail (yearly + weekly seasonality, trend).
Reads JSON from stdin: {"series": [{"week": "2024-01-07", "value": 1000}, ...], "horizon": 13}
Writes JSON to stdout: {"forecast": [...], "lower": [...], "upper": [...], "residual_se": float, "mape": float}
Exit 0 on success; non-zero if Prophet not installed or error (caller falls back to JS model).
"""
import json
import sys
from datetime import datetime, timedelta

def main():
    try:
        raw = sys.stdin.read()
        data = json.loads(raw)
        series = data.get("series", [])
        horizon = int(data.get("horizon", 13))
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)

    if not series or horizon < 1:
        sys.exit(1)

    try:
        import pandas as pd
        from prophet import Prophet
    except ImportError:
        sys.stderr.write("prophet or pandas not installed")
        sys.exit(1)

    rows = []
    for s in series:
        week = s.get("week") or s.get("weekLabel") or s.get("weekKey") or ""
        val = float(s.get("value") or 0)
        if not week or val <= 0:
            continue
        # Parse YYYY-MM-DD or YYYY-Wnn
        try:
            if len(week) >= 10 and week[4] == "-" and week[7] == "-":
                dt = datetime.strptime(week[:10], "%Y-%m-%d")
            elif "W" in week.upper():
                parts = week.replace("-W", " ").split()
                if len(parts) >= 2:
                    y, w = int(parts[0]), int(parts[1])
                    dt = datetime(y, 1, 1) + timedelta(weeks=w - 1)
                else:
                    continue
            else:
                continue
        except Exception:
            continue
        rows.append({"ds": dt.date(), "y": val})

    if len(rows) < 5:
        sys.exit(1)

    df = pd.DataFrame(rows)
    df["ds"] = pd.to_datetime(df["ds"])

    m = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=False,
        interval_width=0.95,
        uncertainty_samples=100,
    )
    m.fit(df)

    last = df["ds"].max()
    future_dates = pd.date_range(start=last + timedelta(days=7), periods=horizon, freq="7D")
    future = pd.DataFrame({"ds": future_dates})

    forecast_df = m.predict(future)
    forecast = forecast_df["yhat"].clip(lower=0).tolist()
    lower = forecast_df["yhat_lower"].clip(lower=0).tolist()
    upper = forecast_df["yhat_upper"].tolist()

    # In-sample MAPE for model selection
    pred_train = m.predict(df[["ds"]])
    pred_y = pred_train["yhat"].values
    actual = df["y"].values
    mape_val = None
    if len(actual) == len(pred_y):
        err = 0.0
        n = 0
        for a, p in zip(actual, pred_y):
            if a != 0:
                err += abs((a - p) / a)
                n += 1
        if n:
            mape_val = round(err / n, 6)

    residual_se = float((actual - pred_y).std()) if len(actual) > 2 else 0.0

    out = {
        "forecast": [round(x, 0) for x in forecast],
        "lower": [max(0, round(x, 0)) for x in lower],
        "upper": [round(x, 0) for x in upper],
        "residual_se": round(residual_se, 2),
        "mape": mape_val,
    }
    print(json.dumps(out))
    sys.exit(0)


if __name__ == "__main__":
    main()
