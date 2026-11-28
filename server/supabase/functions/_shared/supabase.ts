// Service-role Supabase client for Edge Functions.
//
// Probe tables allow access to service_role only, so probe-facing functions
// read them with this client. The key comes from the environment that Supabase
// injects into functions; it must never be logged or returned.

import {
	createClient,
	type SupabaseClient,
} from "npm:@supabase/supabase-js@2.119.2";

function readServiceKey(): string | undefined {
	/* 
    This is prob unessecary.... i'll keep it here just to be safe and not sure which version supabase got rid of service role and replaced with secret.
    */
	const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	if (legacyKey) return legacyKey;

	const singleKey = Deno.env.get("SUPABASE_SECRET_KEY");
	if (singleKey) return singleKey;

	// Newer projects inject named secret keys as a JSON object.
	const namedKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
	if (!namedKeys) return undefined;
	try {
		const parsed = JSON.parse(namedKeys);
		return typeof parsed?.default === "string" ? parsed.default : undefined;
	} catch {
		return undefined;
	}
}

export function createServiceClient(): SupabaseClient {
	const url = Deno.env.get("SUPABASE_URL");
	const key = readServiceKey();
	if (!url || !key) {
		throw new Error("Supabase service client is not configured");
	}
	return createClient(url, key, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
			detectSessionInUrl: false,
		},
	});
}
