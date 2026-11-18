"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { markFloorCommandReviewed } from "@/services/floor-review";

export async function markFloorCommandReviewedAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await markFloorCommandReviewed(id);
  revalidatePath("/admin/sincronizacion");
}
