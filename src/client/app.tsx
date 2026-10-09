import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { NotFoundPage } from "@/pages/not-found";
import { NotesPage } from "@/pages/notes";

const queryClient = new QueryClient();

/** The pages: one Route per page. The server answers every non-/api path with this app. */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <main className="mx-auto max-w-2xl p-6 sm:p-10">
          <Routes>
            <Route path="/" element={<NotesPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
