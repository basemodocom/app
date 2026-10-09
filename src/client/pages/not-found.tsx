import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="space-y-4 text-center">
      <h1 className="text-2xl font-semibold">Nothing here</h1>
      <Button asChild variant="outline">
        <Link to="/">Back home</Link>
      </Button>
    </div>
  );
}
