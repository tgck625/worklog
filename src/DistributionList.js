const ROWS = [
  { event: '2024/09/15 名駅北', gardens: 5,   sheets: 5   },
  { event: '2025/01/26 蟹江',   gardens: 51,  sheets: 51  },
  { event: '2025/05/18 蟹江',   gardens: 63,  sheets: 63  },
  { event: '2025/06/01 春日井', gardens: 1,   sheets: 41  },
  { event: '2025/09/21 名駅北', gardens: 38,  sheets: 53  },
  { event: '2025/10/18 土岐',   gardens: 28,  sheets: 38  },
  { event: '2025/10/25 春日井', gardens: 36,  sheets: 55  },
  { event: '2025/11/09 長久手', gardens: 26,  sheets: 56  },
  { event: '2025/11/16 大府',   gardens: 23,  sheets: 32  },
  { event: '2025/11/16 蟹江',   gardens: 57,  sheets: 95  },
  { event: '2026/01/18 春日井', gardens: 50,  sheets: 74  },
  { event: '2026/01/18 蟹江',   gardens: 52,  sheets: 119 },
  { event: '2026/03/08 長久手', gardens: 43,  sheets: 85  },
  { event: '2026/03/22 名駅北', gardens: 39,  sheets: 47  },
];

export default function DistributionList() {
  return (
    <div style={{ minHeight: '100vh', background: '#faf8f4', padding: '32px 16px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#3a3530', marginBottom: 24 }}>配布実績一覧</h1>
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f3f0ea' }}>
                <th style={thStyle}>イベント</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>配布園数</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>配布枚数</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #ece8e0' }}>
                  <td style={tdStyle}>{r.event}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{r.gardens}園</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{r.sheets}枚</td>
                </tr>
              ))}
              <tr style={{ background: '#f3f0ea', fontWeight: 600 }}>
                <td style={tdStyle}>合計（延べ）</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>512園</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>814枚</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const thStyle = { padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#7a746c', fontSize: 12 };
const tdStyle = { padding: '10px 16px', color: '#3a3530' };
