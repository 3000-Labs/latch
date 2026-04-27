import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { smartAccountAddress?: string };
    if (!body?.smartAccountAddress || typeof body.smartAccountAddress !== "string") {
      return NextResponse.json({ error: "Missing smartAccountAddress" }, { status: 400 });
    }

    const jar = await cookies();
    jar.set("activeSmartAccountAddress", body.smartAccountAddress, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Set active account failed" },
      { status: 500 }
    );
  }
}

