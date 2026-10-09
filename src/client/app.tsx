import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function App() {
  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-10">
      <Card>
        <CardHeader>
          <CardTitle>Hello</CardTitle>
          <CardDescription>This App runs on Basemodo.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href="/api/health">Check the API</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
