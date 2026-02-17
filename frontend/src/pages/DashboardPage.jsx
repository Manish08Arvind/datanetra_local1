import React, { useEffect, useState } from 'react';
import api from '../api.js';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatResponse, setChatResponse] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/dashboard/overview');
        setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const askChat = async (e) => {
    e.preventDefault();
    if (!chatQuestion) return;
    try {
      const res = await api.post('/chat/supply-demand', { question: chatQuestion });
      setChatResponse(res.data);
    } catch (err) {
      setChatResponse({ error: err.response?.data?.message || 'Error' });
    }
  };

  if (loading) return <div>Loading dashboard...</div>;
  if (!data) return <div>Could not load dashboard.</div>;

  return (
    <div className="grid-2">
      <section className="card">
        <h2>MSME Opportunity Dashboard</h2>
        <p className="muted">
          Company: <strong>{data.company.company_name}</strong> ({data.company.udhayam_id}) –{' '}
          {data.company.business_type} in {data.company.location}
        </p>

        <h3>Demand for your products</h3>
        <div className="chips">
          {data.product_demand_summary.map((p) => (
            <div key={p.product_name} className="chip">
              <div className="chip-title">{p.product_name}</div>
              <div className="chip-body">
                Demand: {p.total_demand_units} units · Buyers: {p.potential_buyers} (local:{' '}
                {p.local_buyers})
              </div>
            </div>
          ))}
        </div>

        <div className="grid-2-inner">
          <div>
            <h3>Buy raw materials from</h3>
            <ul className="list">
              {data.buy_from.map((s, idx) => (
                <li key={idx}>
                  <strong>{s.supplier_name}</strong> – {s.location}
                  <br />
                  Contact: {s.contact_number}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Sell your products to</h3>
            <ul className="list">
              {data.sell_to.map((b, idx) => (
                <li key={idx}>
                  <strong>{b.buyer_name}</strong> – {b.location}
                  <br />
                  Demand: {b.estimated_monthly_demand} units · Local:{' '}
                  {b.location_match ? 'Yes' : 'No'}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Supply &amp; Demand Chatbot</h2>
        <p className="muted">
          Ask about suppliers of raw materials or demand for your products. The bot will only show
          company name, address/location, and contact or email details.
        </p>
        <form onSubmit={askChat} className="form-inline">
          <input
            value={chatQuestion}
            onChange={(e) => setChatQuestion(e.target.value)}
            placeholder="Who can supply wheat flour in my location?"
          />
          <button className="btn-secondary" type="submit">
            Ask
          </button>
        </form>
        <div className="chat-response">
          {chatResponse && (
            <>
              {chatResponse.message && <p>{chatResponse.message}</p>}
              {chatResponse.suppliers && (
                <>
                  <h4>Relevant suppliers</h4>
                  <ul className="list">
                    {chatResponse.suppliers.map((s, idx) => (
                      <li key={idx}>
                        <strong>{s.company_name}</strong> – {s.location}
                        <br />
                        Contact: {s.contact_number}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {chatResponse.demand && (
                <>
                  <h4>Demand summary</h4>
                  <ul className="list">
                    {chatResponse.demand.map((d, idx) => (
                      <li key={idx}>
                        {d.product_name}: {d.total_demand_units} units · Buyers:{' '}
                        {d.potential_buyers}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {chatResponse.buyers && (
                <>
                  <h4>Companies interested in your product</h4>
                  <ul className="list">
                    {chatResponse.buyers.map((b, idx) => (
                      <li key={idx}>
                        <strong>{b.company_name}</strong> – {b.email}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {chatResponse.error && <p className="error">{chatResponse.error}</p>}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

