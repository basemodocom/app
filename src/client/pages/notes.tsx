import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Note, ok } from "@/lib/api";

// The example: each visitor's own notes. AGENTS.md lists what to delete with it.

export function NotesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const q = useSettled(search.trim());
  const notes = useQuery({
    queryKey: ["notes", q],
    queryFn: async () => (await ok(api.notes.$get({ query: q ? { q } : {} }))).json(),
    placeholderData: keepPreviousData,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notes"] });

  const add = useMutation({
    mutationFn: (text: string) => ok(api.notes.$post({ json: { text } })),
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => ok(api.notes[":id"].$delete({ param: { id: String(id) } })),
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });

  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate(text, { onSuccess: () => setText("") });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
        <CardDescription>Only you see these.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={submit} className="flex items-end gap-2">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="note">New note</Label>
            <Input id="note" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <Button type="submit" disabled={add.isPending}>
            Add
          </Button>
        </form>
        <div className="grid gap-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {notes.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : notes.isError ? (
          <p className="text-destructive text-sm">{notes.error.message}</p>
        ) : notes.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">{q ? "No notes match." : "No notes yet."}</p>
        ) : (
          <ul className="divide-y">
            {notes.data.map((note: Note) => (
              <li key={note.id} className="flex items-center justify-between gap-4 py-2">
                <span className="break-words">{note.text}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete "${note.text}"`}
                  onClick={() => remove.mutate(note.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** The value once it stops changing for a moment, so typing asks the server once, not per key. */
function useSettled(value: string, ms = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
