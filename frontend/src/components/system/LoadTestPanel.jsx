import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL;

const COURIER_OPTIONS = [50, 100, 200, 500];
const DURATION_OPTIONS = [30, 60, 120, 180];

export default function LoadTestPanel() {
  const [status, setStatus] = useState(null);
  const [courierCount, setCourierCount] = useState(100);
  const [duration, setDuration] = useState(60);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/load-test/status`);
      setStatus(res.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  useEffect(() => {
    if (status?.running) {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchStatus, 2000);
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [status?.running, fetchStatus]);

  const handleStart = async () => {
    setStarting(true);
    try {
      await axios.post(`${API}/load-test/start`, {
        courier_count: courierCount,
        duration: duration,
      });
      toast.success("Yuk testi baslatildi");
      pollRef.current = setInterval(fetchStatus, 2000);
    } catch (err) {
      toast.error(err.response?.data?.error || "Baslatilamadi");
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      await axios.post(`${API}/load-test/stop`);
      toast.info("Durduruluyor...");
    } catch {
      toast.error("Durdurma hatasi");
    }
  };

  const handleCleanup = async () => {
    try {
      const res = await axios.post(`${API}/load-test/cleanup`);
      toast.success(res.data.message);
      fetchStatus();
    } catch {
      toast.error("Temizlik hatasi");
    }
  };

  const isRunning = status?.running;
  const isDone = status?.phase === "done";
  const metrics = status?.metrics;

  return (
    <div data-testid="load-test-panel" className="space-y-6">
      {/* Controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Yuk Testi Konfigurasyonu</h3>
          {status?.phase && status.phase !== "idle" && (
            <span className={`text-xs font-mono px-2 py-1 rounded ${
              status.phase === "running" ? "bg-green-900/50 text-green-400" :
              status.phase === "setup" ? "bg-blue-900/50 text-blue-400" :
              status.phase === "cleaning" ? "bg-yellow-900/50 text-yellow-400" :
              status.phase === "done" ? "bg-zinc-800 text-zinc-400" :
              "bg-zinc-800 text-zinc-400"
            }`}>
              {status.phase === "setup" ? "Kurulum" :
               status.phase === "running" ? "Calisiyor" :
               status.phase === "cleaning" ? "Temizlik" :
               status.phase === "stopping" ? "Durduruluyor" :
               status.phase === "done" ? "Tamamlandi" : status.phase}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Kurye Sayisi</label>
            <div className="flex gap-2">
              {COURIER_OPTIONS.map(n => (
                <button
                  key={n}
                  data-testid={`courier-count-${n}`}
                  onClick={() => !isRunning && setCourierCount(n)}
                  disabled={isRunning}
                  className={`flex-1 py-2 text-sm rounded-md font-medium transition-all ${
                    courierCount === n
                      ? "bg-orange-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  } disabled:opacity-50`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Sure (saniye)</label>
            <div className="flex gap-2">
              {DURATION_OPTIONS.map(n => (
                <button
                  key={n}
                  onClick={() => !isRunning && setDuration(n)}
                  disabled={isRunning}
                  className={`flex-1 py-2 text-sm rounded-md font-medium transition-all ${
                    duration === n
                      ? "bg-orange-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  } disabled:opacity-50`}
                >
                  {n}s
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="bg-zinc-800/50 rounded p-3 mb-4 text-sm text-zinc-400">
          <span className="text-orange-400 font-medium">{courierCount}</span> kurye x{" "}
          <span className="text-orange-400 font-medium">3</span> paket ={" "}
          <span className="text-white font-semibold">{courierCount * 3}</span> aktif siparis |{" "}
          Sure: <span className="text-white font-semibold">{duration}s</span>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          {!isRunning ? (
            <button
              data-testid="start-load-test"
              onClick={handleStart}
              disabled={starting}
              className="flex-1 bg-green-600 hover:bg-green-500 text-white font-medium py-2.5 rounded-md transition-all disabled:opacity-50"
            >
              {starting ? "Baslatiliyor..." : "Testi Baslat"}
            </button>
          ) : (
            <button
              data-testid="stop-load-test"
              onClick={handleStop}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white font-medium py-2.5 rounded-md transition-all"
            >
              Testi Durdur
            </button>
          )}
          <button
            data-testid="cleanup-load-test"
            onClick={handleCleanup}
            disabled={isRunning}
            className="px-4 bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-2.5 rounded-md transition-all disabled:opacity-50"
          >
            Temizle
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {isRunning && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex justify-between text-sm text-zinc-400 mb-2">
            <span>{status?.setup_log?.slice(-1)[0]?.msg || "Hazirlanıyor..."}</span>
            <span className="text-white font-mono">{status?.progress || 0}%</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2">
            <div
              className="bg-orange-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${status?.progress || 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Metrics */}
      {metrics && <MetricsPanel metrics={metrics} courierCount={status?.courier_count || courierCount} />}

      {/* Setup Log */}
      {status?.setup_log?.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h4 className="text-sm font-medium text-zinc-400 mb-2">Log</h4>
          <div className="space-y-1 max-h-40 overflow-y-auto font-mono text-xs text-zinc-500">
            {status.setup_log.map((log, i) => (
              <div key={i}>{log.msg}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


function MetricsPanel({ metrics, courierCount }) {
  const successRate = metrics.total_requests > 0
    ? ((metrics.successful / metrics.total_requests) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-3">
        <MetricCard label="Toplam Istek" value={metrics.total_requests} color="white" />
        <MetricCard label="Basarili" value={metrics.successful} color="green" />
        <MetricCard label="Basarisiz" value={metrics.failed} color="red" />
        <MetricCard label="Rate Limited" value={metrics.rate_limited} color="yellow" />
        <MetricCard label="RPS" value={metrics.rps} color="orange" sub={`${successRate}% basari`} />
      </div>

      {/* Endpoint Breakdown */}
      {Object.keys(metrics.endpoints).length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h4 className="text-sm font-medium text-white">Endpoint Detaylari</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                  <th className="text-left px-4 py-2">Endpoint</th>
                  <th className="text-right px-3 py-2">Toplam</th>
                  <th className="text-right px-3 py-2">Basarili</th>
                  <th className="text-right px-3 py-2">Hata</th>
                  <th className="text-right px-3 py-2">429</th>
                  <th className="text-right px-3 py-2">Ort (ms)</th>
                  <th className="text-right px-3 py-2">P95 (ms)</th>
                  <th className="text-right px-4 py-2">P99 (ms)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metrics.endpoints)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([name, ep]) => (
                  <tr key={name} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-2 text-zinc-300 font-mono text-xs">{name}</td>
                    <td className="text-right px-3 py-2 text-zinc-400">{ep.total}</td>
                    <td className="text-right px-3 py-2 text-green-400">{ep.success}</td>
                    <td className="text-right px-3 py-2 text-red-400">{ep.failed || "-"}</td>
                    <td className="text-right px-3 py-2 text-yellow-400">{ep.rate_limited || "-"}</td>
                    <td className={`text-right px-3 py-2 font-mono ${ep.avg_ms > 500 ? "text-red-400" : ep.avg_ms > 200 ? "text-yellow-400" : "text-green-400"}`}>
                      {ep.avg_ms}
                    </td>
                    <td className={`text-right px-3 py-2 font-mono ${ep.p95_ms > 1000 ? "text-red-400" : ep.p95_ms > 500 ? "text-yellow-400" : "text-green-400"}`}>
                      {ep.p95_ms}
                    </td>
                    <td className={`text-right px-4 py-2 font-mono ${ep.p99_ms > 2000 ? "text-red-400" : ep.p99_ms > 1000 ? "text-yellow-400" : "text-green-400"}`}>
                      {ep.p99_ms}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Timeline Chart (simple bar chart) */}
      {metrics.timeline?.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <h4 className="text-sm font-medium text-white mb-3">RPS Zaman Serisi</h4>
          <div className="flex items-end gap-0.5 h-24">
            {metrics.timeline.map((point, i) => {
              const maxRps = Math.max(...metrics.timeline.map(p => p.rps), 1);
              const height = (point.rps / maxRps) * 100;
              const hasErrors = point.failed > 0;
              return (
                <div
                  key={i}
                  className="flex-1 min-w-[3px] relative group"
                  style={{ height: "100%" }}
                >
                  <div
                    className={`absolute bottom-0 w-full rounded-t transition-all ${
                      hasErrors ? "bg-red-500" : "bg-orange-500"
                    }`}
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-zinc-700 text-xs text-white px-2 py-1 rounded whitespace-nowrap z-10">
                    {point.t}s: {point.rps} rps
                    {point.failed > 0 && ` (${point.failed} hata)`}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-zinc-600 mt-1">
            <span>{metrics.timeline[0]?.t || 0}s</span>
            <span>{metrics.timeline[metrics.timeline.length - 1]?.t || 0}s</span>
          </div>
        </div>
      )}

      {/* Capacity Projection */}
      <CapacityProjection metrics={metrics} courierCount={courierCount} />

      {/* Errors */}
      {metrics.recent_errors?.length > 0 && (
        <div className="bg-zinc-900 border border-red-900/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-red-400 mb-2">Son Hatalar</h4>
          <div className="space-y-1 max-h-32 overflow-y-auto font-mono text-xs text-red-300/70">
            {metrics.recent_errors.map((err, i) => (
              <div key={i}>[{err.endpoint}] {err.error}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


function CapacityProjection({ metrics, courierCount }) {
  // Her kuryenin urettigi istek sayisi
  const reqPerCourier = metrics.total_requests > 0 && metrics.elapsed_seconds > 0
    ? (metrics.total_requests / courierCount / metrics.elapsed_seconds * 60).toFixed(1)
    : 0;

  const scenarios = [50, 100, 200, 500].map(n => {
    const totalRpm = n * reqPerCourier;
    const rateLimit = 200; // per IP
    const wouldHitLimit = totalRpm > rateLimit;
    return { couriers: n, rpm: Math.round(totalRpm), wouldHitLimit };
  });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h4 className="text-sm font-medium text-white mb-3">Kapasite Tahmini</h4>
      <p className="text-xs text-zinc-500 mb-3">
        Kurye basina ortalama: <span className="text-orange-400 font-mono">{reqPerCourier}</span> istek/dk
      </p>
      <div className="grid grid-cols-4 gap-3">
        {scenarios.map(s => (
          <div key={s.couriers} className={`rounded-lg p-3 text-center ${
            s.couriers === courierCount ? "border-2 border-orange-500 bg-zinc-800" : "bg-zinc-800/50"
          }`}>
            <div className="text-lg font-bold text-white">{s.couriers}</div>
            <div className="text-xs text-zinc-500">kurye</div>
            <div className={`text-sm font-mono mt-1 ${
              s.rpm > 1000 ? "text-red-400" : s.rpm > 500 ? "text-yellow-400" : "text-green-400"
            }`}>
              {s.rpm}/dk
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function MetricCard({ label, value, color, sub }) {
  const colorClass = {
    white: "text-white",
    green: "text-green-400",
    red: "text-red-400",
    yellow: "text-yellow-400",
    orange: "text-orange-400",
  }[color] || "text-white";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
      <div className={`text-2xl font-bold font-mono ${colorClass}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  );
}
