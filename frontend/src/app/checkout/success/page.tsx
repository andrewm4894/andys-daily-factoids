import { CheckoutSuccess } from "@/components/checkout-success";

type SearchParams = Record<string, string | string[] | undefined>;

interface CheckoutSuccessPageProps {
  searchParams?: SearchParams;
}

export default function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const rawSessionId = searchParams?.session_id;
  const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;

  return (
    <main className="px-4 py-10 sm:px-8">
      <CheckoutSuccess sessionId={sessionId} />
    </main>
  );
}
