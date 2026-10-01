import { redirect } from "next/navigation";

// The workspace list is the home; /w sends anonymous visitors to /login.
export default function Home() {
  redirect("/w");
}
