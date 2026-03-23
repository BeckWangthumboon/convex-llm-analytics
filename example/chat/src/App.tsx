import { ConvexProvider } from "convex/react";
import { convex } from "@/lib/convex";
import { ChatScreen } from "@/components/chat-screen";

function MissingEnvironment() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="rounded-xl bg-accent px-8 py-6">
        <p className="text-sm text-muted-foreground">Missing Convex client URL.</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Start the local Convex dev server in{" "}
          <code className="rounded bg-muted px-1.5 py-1 text-sm">example/chat</code>{" "}
          and reload after{" "}
          <code className="rounded bg-muted px-1.5 py-1 text-sm">VITE_CONVEX_URL</code>{" "}
          is available.
        </p>
      </div>
    </main>
  );
}

function App() {
  if (!convex) {
    return (
      <div className="dark">
        <MissingEnvironment />
      </div>
    );
  }

  return (
    <div className="dark">
      <ConvexProvider client={convex}>
        <ChatScreen />
      </ConvexProvider>
    </div>
  );
}

export default App;
