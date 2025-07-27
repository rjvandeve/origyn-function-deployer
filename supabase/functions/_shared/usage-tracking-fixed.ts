import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.1';

// Simple wrapper that tracks usage for any handler function
export function withUsageTracking(
  handler: (req: Request) => Promise<Response>,
  serviceName: string,
  endpointId?: string
) {
  return async (req: Request): Promise<Response> => {
    const startTime = Date.now();
    let response: Response;
    let error: Error | null = null;

    try {
      // Extract project name from request body or header
      let projectName = 'default';
      
      try {
        const body = await req.clone().json();
        if (body.project_name) {
          projectName = body.project_name;
        }
      } catch {
        // If body isn't JSON, check header
        projectName = req.headers.get('X-Project-Name') || 'default';
      }

      // Execute the actual handler
      response = await handler(req);

      // Calculate response time
      const responseTimeMs = Date.now() - startTime;

      // Log usage asynchronously (don't wait)
      logUsage({
        serviceName,
        endpointId,
        projectName,
        requestTimestamp: new Date().toISOString(),
        responseStatus: response.status,
        responseTimeMs,
        errorMessage: null,
        requestMetadata: {
          method: req.method,
          url: req.url,
          userAgent: req.headers.get('user-agent'),
          origin: req.headers.get('origin')
        }
      }).catch(err => console.error('Failed to log usage:', err));

      return response;
    } catch (err) {
      error = err as Error;
      const responseTimeMs = Date.now() - startTime;

      // Log error usage
      logUsage({
        serviceName,
        endpointId,
        projectName: 'error',
        requestTimestamp: new Date().toISOString(),
        responseStatus: 500,
        responseTimeMs,
        errorMessage: error.message,
        requestMetadata: {
          method: req.method,
          url: req.url
        }
      }).catch(err => console.error('Failed to log error usage:', err));

      // Return error response
      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          message: error.message
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  };
}

// Log usage data to the database
async function logUsage(data: {
  serviceName: string;
  endpointId?: string;
  projectName: string;
  requestTimestamp: string;
  responseStatus: number;
  responseTimeMs: number;
  errorMessage: string | null;
  requestMetadata: Record<string, any>;
}) {
  try {
    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Insert usage log
    const { error } = await supabase
      .from('service_usage_logs')
      .insert({
        service_name: data.serviceName,
        endpoint_id: data.endpointId || null,
        project_name: data.projectName,
        request_timestamp: data.requestTimestamp,
        response_status: data.responseStatus,
        response_time_ms: data.responseTimeMs,
        request_payload_size: 0,
        response_payload_size: 0,
        error_message: data.errorMessage,
        request_metadata: data.requestMetadata
      });

    if (error) {
      console.error('Failed to log usage:', error);
    } else {
      console.log('Usage logged successfully for', data.serviceName);
    }
  } catch (error) {
    console.error('Error in usage logging:', error);
  }
} 