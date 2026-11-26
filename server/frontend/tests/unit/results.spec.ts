import { GET } from "@/app/api/results/route";
import { expect, test } from "@playwright/test";

const originalFetch = globalThis.fetch;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.SUPABASE_SECRET_KEY;

// Sample Measurement Data
const measurement = {
    id: "measurement-1",
    started_at: "2026-11-23T10:00:00Z",
    status: "completed",
    result_data: {
        rtt_avg_ms: 7.7,
        packet_loss_pct: 0,
    },
    probes: {
        name: "My Test Probe",
    },
    test_revisions: {
        version_number: 1,
        definition: {
            metrics: {
                rtt_avg_ms: {
                    label: "Average latency",
                    unit: "ms",
                },
                packet_loss_pct: {
                    label: "Packet loss",
                    unit: "%",
                },
            },
        },
        tests: {
            name: "Ping",
        },
    },
};

test.beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SECRET_KEY = "for-testing";
});

test.afterEach(() => {
    globalThis.fetch = originalFetch;

    if (originalUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalKey === undefined) {
        delete process.env.SUPABASE_SECRET_KEY;
    } else {
        process.env.SUPABASE_SECRET_KEY = originalKey;
    }
});

// Missing Supabase configuration
test("returns 500 when Supabase configuration is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
        error: "Missing supabase configuration",
    });
});

// Empty measurement list
test("returns an empty list when no measurement exists", async() => {
    globalThis.fetch = async () => {
        return Response.json([]);
    }

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(({results : [],}));
});

// Missing URL
test("returns 500 when Supabase URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const response = await GET();

    expect(response.status).toBe(500);
});

// No measurements
test("returns an empty list when no measurements exist", async () => {
    globalThis.fetch = async () => Response.json([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
        results: [],
    });
});

// Single measurement
test("returns a correctly formatted measurement", async () => {
    globalThis.fetch = async () => Response.json([measurement]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
        results: [
            {
                id: "measurement-1",
                probe_name: "My Test Probe",
                test_name: "Ping",
                revision_number: 1,
                started_at: "2026-11-23T10:00:00Z",
                status: "completed",
                metrics: {
                    rtt_avg_ms: {
                        label: "Average latency",
                        unit: "ms",
                        value: 7.7,
                    },
                    packet_loss_pct: {
                        label: "Packet loss",
                        unit: "%",
                        value: 0,
                    },
                },
            },
        ],
    });
});

// Multiple measurements
test("returns multiple measurements", async () => {
    globalThis.fetch = async () => Response.json([
        measurement,
        {
            ...measurement,
            id: "measurement-2",
            probes: {
                name: "My Test Probe 2",
            },
        },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results).toHaveLength(2);
    expect(data.results[0].probe_name).toBe("My Test Probe");
    expect(data.results[1].probe_name).toBe("My Test Probe 2");
});

// Null metric value
test("preserves null metric values", async () => {
    globalThis.fetch = async () => Response.json([
        {
            ...measurement,
            result_data: {
                rtt_avg_ms: null,
                packet_loss_pct: 100,
            },
        },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results[0].metrics.rtt_avg_ms.value).toBeNull();
});

// Zero metric value
test("preserves zero metric values", async () => {
    globalThis.fetch = async () => Response.json([measurement]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results[0].metrics.packet_loss_pct.value).toBe(0);
});

// Failed measurement
test("returns a failed measurement with empty metrics", async () => {
    globalThis.fetch = async () => Response.json([
        {
            ...measurement,
            status: "failed",
            result_data: {},
        },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results[0].status).toBe("failed");
    expect(data.results[0].metrics).toEqual({});
});


// Different revision definitions
test("uses the metric definition from each revision", async () => {
    globalThis.fetch = async () => Response.json([
        measurement,
        {
            ...measurement,
            id: "measurement-2",
            result_data: {
                rtt_avg_ms: 0.02,
            },
            test_revisions: {
                ...measurement.test_revisions,
                version_number: 2,
                definition: {
                    metrics: {
                        rtt_avg_ms: {
                            label: "Latency",
                            unit: "s",
                        },
                    },
                },
            },
        },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results[0].revision_number).toBe(1);
    expect(data.results[0].metrics.rtt_avg_ms.label).toBe("Average latency");
    expect(data.results[0].metrics.rtt_avg_ms.unit).toBe("ms");

    expect(data.results[1].revision_number).toBe(2);
    expect(data.results[1].metrics.rtt_avg_ms.label).toBe("Latency");
    expect(data.results[1].metrics.rtt_avg_ms.unit).toBe("s");
});

// Unused metric definition
test("only returns metrics with measured values", async () => {
    globalThis.fetch = async () => Response.json([
        {
            ...measurement,
            result_data: {
                rtt_avg_ms: 18.4,
            },
        },
    ]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results[0].metrics).toEqual({
        rtt_avg_ms: {
            label: "Average latency",
            unit: "ms",
            value: 18.4,
        },
    });
});

// Missing metric definition
// TODO: Current behavior, pending confirmation from the team.
test("returns 500 when a metric definition is missing", async () => {
    globalThis.fetch = async () => Response.json([
        {
            ...measurement,
            result_data: {
                undefined_metric: 10,
            },
        },
    ]);

    const response = await GET();

    expect(response.status).toBe(500);
});

// Failed Supabase response
test("returns 500 when Supabase returns an error", async () => {
    globalThis.fetch = async () => {
        return Response.json({}, { status: 500 });
    };

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
        error: "Failed to fetch",
    });
});


// Query ordering and limit
test("requests the latest 100 measurements", async () => {
    let requestUrl = "";

    globalThis.fetch = async (input) => {
        requestUrl = String(input);
        return Response.json([]);
    };

    const response = await GET();
    const url = new URL(requestUrl);

    expect(response.status).toBe(200);
    expect(url.pathname).toBe("/rest/v1/measurements");
    expect(url.searchParams.get("order")).toBe("received_at.desc");
    expect(url.searchParams.get("limit")).toBe("100");
});