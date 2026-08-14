import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getToolById } from "@/lib/db/tools";
import { ToolForm } from "@/components/admin/tool-form";

export const dynamic = "force-dynamic";

export default async function EditToolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const tool = await getToolById(supabase, id);
  if (!tool) notFound();

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-foreground">Edit {tool.name}</h1>
      <ToolForm tool={tool} />
    </div>
  );
}
