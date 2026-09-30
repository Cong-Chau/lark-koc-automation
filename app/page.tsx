import { RuntimeLogsPanel } from "@/app/runtime-logs-panel";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="border-b border-zinc-800 bg-zinc-950">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-sky-300">Tự động hóa KOC</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-zinc-50">
              Màn hình runtime
            </h1>
          </div>
          <div className="grid gap-2 text-sm text-zinc-400 md:grid-cols-3">
            <div className="rounded-lg border border-zinc-800 px-3 py-2">
              <span className="text-zinc-500">Endpoint chuẩn bị</span>
              <p className="mt-1 font-mono text-zinc-200">
                POST /api/prepare-koc
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 px-3 py-2">
              <span className="text-zinc-500">Endpoint ghi dữ liệu</span>
              <p className="mt-1 font-mono text-zinc-200">
                POST /api/append-koc
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 px-3 py-2">
              <span className="text-zinc-500">Endpoint log</span>
              <p className="mt-1 font-mono text-zinc-200">GET /api/logs</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-6">
        <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Job chuẩn bị sẽ đọc dữ liệu và lưu kế hoạch ghi vào file cache local.
          Job ghi sẽ append dòng thật vào Lark từ kế hoạch đã chuẩn bị. Log chỉ
          được giữ trong bộ nhớ của server process hiện tại và vẫn được in ra
          console.
        </div>
        <RuntimeLogsPanel />
      </section>
    </main>
  );
}
