import dynamic from "next/dynamic";
import HabitTracker from "@/components/HabitTracker";

// Lazy load AuthModal - only loaded when auth modal is opened
const AuthModal = dynamic(() => import("@/components/AuthModal"), {
  ssr: false, // Don't render on server since it's a client-only modal
});

export default function Home() {
  return (
    <>
      <HabitTracker />
      <AuthModal />
    </>
  );
}
