// app/user-profile/[[...user-profile]]/page.tsx
import { UserProfile } from "@clerk/nextjs";
import Link from "next/link"; // Import Link from Next.js

export default function UserProfilePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div >
        <Link href="/" className="text-[#528F04] hover:underline mb-4 block">
          &larr; Back to Home
        </Link>
        <UserProfile routing="path" path="/user-profile" />
      </div>
    </div>
  );
}