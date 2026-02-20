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
        <div className="company-details-block">
          <p className="muted" style={{ marginBottom: '0.5rem' }}>
            <strong>{data.company.company_name}</strong> ({data.company.udhayam_id})
          </p>
          <p className="muted" style={{ marginTop: 0 }}>
            {data.company.sector_label || data.company.business_type} · {data.company.location}
          </p>
          {(data.company.primary_owner || data.company.secondary_owner || data.company.email || data.company.mobile_number || data.company.gstin) && (
            <ul className="company-details-list">
              {data.company.primary_owner && <li>Primary owner: {data.company.primary_owner}</li>}
              {data.company.secondary_owner && <li>Secondary owner: {data.company.secondary_owner}</li>}
              {data.company.email && <li>Email: {data.company.email}</li>}
              {data.company.mobile_number && <li>Contact: {data.company.mobile_number}</li>}
              {data.company.gstin && <li>GSTIN: {data.company.gstin}</li>}
            </ul>
          )}
        </div>

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
            <h3>
              {data.company.sector_label || data.company.business_type} wholesalers – buy raw materials
            </h3>
            <p className="muted" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
              Wholesalers in your sector from whom you can source raw materials.
            </p>
            <ul className="list">
              {(data.sector_wholesalers && data.sector_wholesalers.length > 0
                ? data.sector_wholesalers
                : data.buy_from || []
              ).map((s, idx) => (
                <li key={idx}>
                  <strong>{s.supplier_name}</strong> – {s.location}
                  {s.product_name && (
                    <>
                      <br />
                      <span className="muted">Product: {s.product_name}</span>
                    </>
                  )}
                  <br />
                  Contact: {s.contact_number || '—'}
                </li>
              ))}
            </ul>
            {(!data.sector_wholesalers || data.sector_wholesalers.length === 0) && (data.buy_from || []).length === 0 && (
              <p className="muted">No wholesalers found for your sector yet. Use the chatbot below to ask for suppliers.</p>
            )}
          </div>
          <div>
            <h3>Companies in need of your products</h3>
            <p className="muted" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
              Companies looking for the products your company sells.
            </p>
            <ul className="list">
              {(data.sell_to || []).map((b, idx) => (
                <li key={idx}>
                  <strong>{b.buyer_name}</strong> – {b.location}
                  <br />
                  <span className="muted">Needs: {b.product_name}</span>
                  <br />
                  Demand: {b.estimated_monthly_demand} units/month · Same location:{' '}
                  {b.location_match ? 'Yes' : 'No'}
                  {b.email && (
                    <>
                      <br />
                      Email: {b.email}
                    </>
                  )}
                  {b.mobile_number && (
                    <>
                      <br />
                      Contact: {b.mobile_number}
                    </>
                  )}
                </li>
              ))}
            </ul>
            {(!data.sell_to || data.sell_to.length === 0) && (
              <p className="muted">No companies in need of your products yet. Demand will appear here as more trade relations are added.</p>
            )}
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

