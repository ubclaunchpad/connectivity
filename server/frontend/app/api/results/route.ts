export async function GET() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;

    if (!url || !key) {
        return Response.json(
            { error: "Missing supabase configuration"},
            { status: 500}
        );
    }
    return Response.json(
        { message: "Supabase configuration found" },
        { status: 200 }
    );
}
    