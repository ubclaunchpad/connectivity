export async function GET() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;

    if (!url || !key) {
        return Response.json(
            { error: "Missing supabase configuration"},
            { status: 500}
        );
    }
    
    const query = new URLSearchParams({
        select: [
            "id",
            "started_at",
            "status",
            "result_data",
            "probes!measurements_probe_id_fkey(name)",
            "test_revisions!measurements_test_revision_id_fkey(version_number,definition,tests(name))",
        ].join(","),
        order: "received_at.desc",
        limit: "100",
    }); 

    const response = await fetch(
        `${url}/rest/v1/measurements?${query}`,
        {
            headers: {
                apikey: key,
            },
            cache: "no-store",
        },
    );

    const data = await response.json();

    return Response.json(
        { results: data }
    );
}
    