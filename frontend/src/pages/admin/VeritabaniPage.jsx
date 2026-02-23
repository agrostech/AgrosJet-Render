import { useState, useEffect } from "react";
import axios from "axios";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function VeritabaniPage() {
  const [dbInfo, setDbInfo] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [collectionData, setCollectionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [limit, setLimit] = useState(20);
  const [skip, setSkip] = useState(0);

  useEffect(() => {
    fetchDbInfo();
  }, []);

  const fetchDbInfo = async () => {
    try {
      const res = await axios.get(`${API}/database/info`);
      setDbInfo(res.data);
    } catch (err) {
      console.error("DB bilgisi alınamadı:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCollectionData = async (collectionName, newSkip = 0) => {
    setDataLoading(true);
    setSelectedCollection(collectionName);
    setSkip(newSkip);
    try {
      const res = await axios.get(`${API}/database/collection/${collectionName}`, {
        params: { limit, skip: newSkip }
      });
      setCollectionData(res.data);
    } catch (err) {
      console.error("Koleksiyon verisi alınamadı:", err);
    } finally {
      setDataLoading(false);
    }
  };

  const formatValue = (value) => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "object") return JSON.stringify(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
  };

  if (loading) {
    return (
      <div style={{ padding: 20, fontFamily: "monospace" }}>
        Yükleniyor...
      </div>
    );
  }

  return (
    <div style={{ padding: 20, fontFamily: "monospace", fontSize: 13, backgroundColor: "#1e1e1e", color: "#d4d4d4", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: 20, borderBottom: "1px solid #444", paddingBottom: 10 }}>
        <h1 style={{ margin: 0, color: "#569cd6" }}>Veritabanı Görüntüleyici</h1>
        <p style={{ margin: "5px 0 0 0", color: "#6a9955" }}>
          Aktif DB: <span style={{ color: "#ce9178" }}>{dbInfo?.database_name}</span>
          {" | "}
          Koleksiyon Sayısı: <span style={{ color: "#b5cea8" }}>{dbInfo?.total_collections}</span>
        </p>
      </div>

      <div style={{ display: "flex", gap: 20 }}>
        {/* Sol Panel - Koleksiyonlar */}
        <div style={{ width: 250, flexShrink: 0 }}>
          <div style={{ color: "#569cd6", marginBottom: 10, fontWeight: "bold" }}>
            KOLEKSIYONLAR
          </div>
          <div style={{ border: "1px solid #444", backgroundColor: "#252526" }}>
            {dbInfo?.collections?.map((coll) => (
              <div
                key={coll.name}
                onClick={() => fetchCollectionData(coll.name)}
                style={{
                  padding: "8px 10px",
                  cursor: "pointer",
                  borderBottom: "1px solid #333",
                  backgroundColor: selectedCollection === coll.name ? "#094771" : "transparent",
                  display: "flex",
                  justifyContent: "space-between"
                }}
              >
                <span style={{ color: "#dcdcaa" }}>{coll.name}</span>
                <span style={{ color: "#6a9955" }}>({coll.count})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sağ Panel - Veri */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {!selectedCollection && (
            <div style={{ color: "#6a9955", padding: 20 }}>
              ← Sol panelden bir koleksiyon seçin
            </div>
          )}

          {selectedCollection && dataLoading && (
            <div style={{ color: "#dcdcaa", padding: 20 }}>
              Yükleniyor...
            </div>
          )}

          {selectedCollection && collectionData && !dataLoading && (
            <div>
              {/* Koleksiyon Başlığı */}
              <div style={{ marginBottom: 10, color: "#569cd6", fontWeight: "bold" }}>
                {collectionData.collection.toUpperCase()}
                <span style={{ fontWeight: "normal", color: "#6a9955", marginLeft: 10 }}>
                  ({collectionData.showing} / {collectionData.total} kayıt gösteriliyor)
                </span>
              </div>

              {/* Pagination */}
              <div style={{ marginBottom: 10, display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={() => fetchCollectionData(selectedCollection, Math.max(0, skip - limit))}
                  disabled={skip === 0}
                  style={{ padding: "5px 10px", cursor: skip === 0 ? "not-allowed" : "pointer", backgroundColor: "#333", color: "#fff", border: "1px solid #555" }}
                >
                  ← Önceki
                </button>
                <span style={{ color: "#d4d4d4" }}>
                  Sayfa {Math.floor(skip / limit) + 1} / {Math.ceil(collectionData.total / limit)}
                </span>
                <button
                  onClick={() => fetchCollectionData(selectedCollection, skip + limit)}
                  disabled={skip + limit >= collectionData.total}
                  style={{ padding: "5px 10px", cursor: skip + limit >= collectionData.total ? "not-allowed" : "pointer", backgroundColor: "#333", color: "#fff", border: "1px solid #555" }}
                >
                  Sonraki →
                </button>
                <select
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); fetchCollectionData(selectedCollection, 0); }}
                  style={{ padding: "5px", backgroundColor: "#333", color: "#fff", border: "1px solid #555" }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* Tablo */}
              {collectionData.data?.length > 0 ? (
                <div style={{ overflow: "auto", border: "1px solid #444" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                    <thead>
                      <tr style={{ backgroundColor: "#252526" }}>
                        {collectionData.fields?.map((field) => (
                          <th
                            key={field}
                            style={{
                              padding: "8px 10px",
                              textAlign: "left",
                              borderBottom: "1px solid #444",
                              color: "#569cd6",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {field}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {collectionData.data.map((row, idx) => (
                        <tr
                          key={idx}
                          style={{ backgroundColor: idx % 2 === 0 ? "#1e1e1e" : "#252526" }}
                        >
                          {collectionData.fields?.map((field) => (
                            <td
                              key={field}
                              style={{
                                padding: "6px 10px",
                                borderBottom: "1px solid #333",
                                maxWidth: 300,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                color: "#d4d4d4"
                              }}
                              title={formatValue(row[field])}
                            >
                              {formatValue(row[field])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ color: "#6a9955", padding: 20 }}>
                  Bu koleksiyonda veri yok.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
