import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import ReceiptReviewClient from "./ReceiptReviewClient";

export default async function Page() {
  const { userId } = await auth();
  if (!userId) return redirect("/sign-in");
  return <ReceiptReviewClient />;
}