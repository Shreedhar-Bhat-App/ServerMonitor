using Microsoft.AspNetCore.Mvc;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Diagnostics;
using System.Collections.Concurrent;

namespace ServerMonitor.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ServerStatusController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private static readonly ConcurrentDictionary<string, (ServerStatus Status, DateTime CachedAt)> _cache = new();
    private static readonly TimeSpan _cacheExpiration = TimeSpan.FromSeconds(30);

    public ServerStatusController(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    [HttpGet]
    public async Task<IActionResult> GetServerStatus()
    {
        var serverCategories = _configuration.GetSection("ServerCategories").Get<Dictionary<string, Dictionary<string, string>>>() 
                              ?? new Dictionary<string, Dictionary<string, string>>();

        var statusList = new List<ServerStatus>();
        
        // Clean up expired cache entries periodically
        CleanupExpiredCache();

        foreach (var category in serverCategories)
        {
            foreach (var server in category.Value)
            {
                var cacheKey = $"{category.Key}:{server.Key}:{server.Value}";
                
                // Check cache first
                if (_cache.TryGetValue(cacheKey, out var cached) && 
                    DateTime.Now - cached.CachedAt < _cacheExpiration)
                {
                    // Return cached result
                    statusList.Add(cached.Status);
                }
                else
                {
                    // Perform actual health check
                    var status = await CheckServerStatus(server.Value);
                    var serverStatus = new ServerStatus
                    {
                        Name = server.Key,
                        Host = server.Value,
                        Category = category.Key,
                        Status = status.Status,
                        ResponseTime = status.ResponseTime,
                        LastChecked = DateTime.Now
                    };
                    
                    // Update cache
                    _cache[cacheKey] = (serverStatus, DateTime.Now);
                    statusList.Add(serverStatus);
                }
            }
        }

        return Ok(statusList);
    }
    
    private void CleanupExpiredCache()
    {
        var expiredKeys = _cache
            .Where(kvp => DateTime.Now - kvp.Value.CachedAt > _cacheExpiration)
            .Select(kvp => kvp.Key)
            .ToList();
            
        foreach (var key in expiredKeys)
        {
            _cache.TryRemove(key, out _);
        }
    }

    private async Task<(string Status, long ResponseTime)> CheckServerStatus(string host)
    {
        var stopwatch = Stopwatch.StartNew();
        
        try
        {
            // Try HTTP/HTTPS connection first
            var httpCheck = await TryHttpConnection(host);
            stopwatch.Stop();
            
            if (httpCheck.Success)
            {
                var responseTime = stopwatch.ElapsedMilliseconds;
                
                // Green: Response time < 500ms
                // Yellow: Response time 500-25000ms
                // Red: Response time > 25000ms or failed
                if (responseTime < 500)
                    return ("green", responseTime);
                else if (responseTime < 25000)
                    return ("yellow", responseTime);
                else
                    return ("red", responseTime);
            }
            
            // Fallback: Try TCP port check if HTTP fails
            stopwatch.Restart();
            var tcpCheck = await TryTcpConnection(host, 80); // Try port 80
            stopwatch.Stop();
            
            if (tcpCheck)
            {
                var responseTime = stopwatch.ElapsedMilliseconds;
                if (responseTime < 500)
                    return ("green", responseTime);
                else if (responseTime < 25000)
                    return ("yellow", responseTime);
                else
                    return ("red", responseTime);
            }
            
            return ("red", 0);
        }
        catch
        {
            stopwatch.Stop();
            return ("red", 0);
        }
    }
    
    private async Task<(bool Success, int StatusCode)> TryHttpConnection(string host)
    {
        try
        {
            using var httpClient = new HttpClient();
            // Reduced timeout for health checks - they should be fast
            httpClient.Timeout = TimeSpan.FromSeconds(3);
            
            // Common health check endpoints to try (lightweight endpoints first)
            var healthEndpoints = new[] { "/health", "/api/health", "/healthz", "/ping", "/" };
            var protocols = new[] { "https", "http" };
            
            // Try health endpoints first with both protocols
            foreach (var protocol in protocols)
            {
                foreach (var endpoint in healthEndpoints)
                {
                    try
                    {
                        var url = $"{protocol}://{host}{endpoint}";
                        // ResponseHeadersRead: Only read headers, not full content (faster)
                        var response = await httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
                        
                        // Accept any response (even 404, 500) as long as the server responds
                        // This means the server is alive
                        return (true, (int)response.StatusCode);
                    }
                    catch (HttpRequestException)
                    {
                        // Try next endpoint/protocol
                        continue;
                    }
                    catch (TaskCanceledException)
                    {
                        // Timeout - try next endpoint/protocol
                        continue;
                    }
                }
            }
            
            return (false, 0);
        }
        catch
        {
            return (false, 0);
        }
    }
    
    private async Task<bool> TryTcpConnection(string host, int port)
    {
        try
        {
            using var tcpClient = new TcpClient();
            var connectTask = tcpClient.ConnectAsync(host, port);
            var timeoutTask = Task.Delay(3000); // Reduced to 3 seconds
            
            var completedTask = await Task.WhenAny(connectTask, timeoutTask);
            
            if (completedTask == connectTask && tcpClient.Connected)
            {
                return true;
            }
            
            return false;
        }
        catch
        {
            return false;
        }
    }
}

public class ServerStatus
{
    public string Name { get; set; } = string.Empty;
    public string Host { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public long ResponseTime { get; set; }
    public DateTime LastChecked { get; set; }
}
