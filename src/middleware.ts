import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Forwards the current pathname to Server Components (e.g. layout.tsx) via a
// request header, since the App Router doesn't expose it directly.
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
