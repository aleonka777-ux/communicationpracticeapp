import { uploadManualAction } from "@/lib/admin/manualActions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";

export default function NewManualVersionPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-foreground">Upload Manual version</h1>
      <form action={uploadManualAction} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="source">Manual Markdown file (.md)</Label>
          <input
            id="source"
            name="source"
            type="file"
            accept=".md,text/markdown"
            required
            className="block w-full text-sm text-foreground file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
          />
          <p className="text-sm text-foreground-muted">
            The version label, status, author and updated date are read automatically from the
            document&apos;s own header (its <code>**Version:**</code> line etc.) — you don&apos;t
            retype them here.
          </p>
        </div>

        <Button type="submit" size="lg" className="w-full sm:w-auto">
          Upload as draft
        </Button>
      </form>
    </div>
  );
}
