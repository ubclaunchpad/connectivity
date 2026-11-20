type MetricDefinition = {
    label: string;
    unit: string;
};

type Measurement = {
    id: string;
    started_at: string;
    status: string;
    result_data: Record<string, unknown>;
    probes: {
        name: string;
    };
    test_revisions: {
        version_number: number;
        definition: {
            metrics: Record<string, MetricDefinition>;
        };
        tests: {
            name: string;
        };
    };
};

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
    
    const data: Measurement[] = await response.json();

    const result = data.map((measurement)=> {
        const definitions = measurement.test_revisions.definition.metrics;
        const values = measurement.result_data;

        const metrics: Record<string, {
            label: string;
            unit: string;
            value: unknown;
        }> = {};
        // Combine metric definitions with measured values dynamically
        for (const name in values) {
            if (!definitions[name]) {
                throw new Error("Missing metric definition");
            }

            metrics[name] = {
                label: definitions[name].label,
                unit: definitions[name].unit,
                value: values[name],
            };
        }

        return {
                id: measurement.id,
                probe_name: measurement.probes.name,
                test_name: measurement.test_revisions.tests.name,
                revision_number: measurement.test_revisions.version_number,
                started_at: measurement.started_at,
                status: measurement.status,
                metrics: metrics,
        }
    })

    return Response.json(
        { results: result }
    );
}
    