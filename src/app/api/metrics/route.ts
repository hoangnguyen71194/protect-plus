import { NextRequest, NextResponse } from "next/server";
import { getMetricsFromDb } from "@/lib/orders";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get("days") || "30");

    const data = await getMetricsFromDb(days);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
