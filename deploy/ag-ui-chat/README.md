# AG-UI Chat Deployment Guide

Production-ready standalone AG-UI chat application.

## Quick Start

### Option 1: Docker Compose (Recommended)

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Option 2: Direct Deployment

```bash
# Copy files
sudo cp production-agui-chat.html /var/www/ag-ui-chat/
sudo cp nginx.conf /etc/nginx/sites-available/ag-ui-chat

# Enable site
sudo ln -sf /etc/nginx/sites-available/ag-ui-chat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Option 3: Deployment Script

```bash
# Make executable
chmod +x deploy.sh

# Deploy with defaults
sudo ./deploy.sh

# Deploy with custom settings
sudo ./deploy.sh \
  -e production \
  -w ws://your-backend:5000/ag-ui/ws \
  -s my-session \
  -t your-auth-token \
  -n ag-ui.yourdomain.com
```

## Configuration

### Environment Variables

| Variable      | Default                        | Description                         |
| ------------- | ------------------------------ | ----------------------------------- |
| `WS_URL`      | `ws://127.0.0.1:5000/ag-ui/ws` | WebSocket server URL                |
| `OLLAMA_HOST` | `http://127.0.0.1:11434`       | Ollama API host (local or remote)   |
| `SESSION_ID`  | `test-session`                 | Default session ID                  |
| `AUTH_TOKEN`  | `dev-token-12345`              | Authentication token (min 10 chars) |
| `SERVER_NAME` | `localhost`                    | Server name for nginx               |

### Remote Ollama Support

Connect to a remote Ollama instance (e.g., another computer on your network):

```bash
# Set Ollama host to remote IP
export OLLAMA_HOST=http://100.94.136.15:11434

# Or in .env file
OLLAMA_HOST=http://100.94.136.15:11434
```

**Available remote models** (on the remote host):

- `ollama/llama3.2-vision:11b` ⭐ Vision support
- `ollama/llama3.2-vision:latest`
- `ollama/llava:latest`
- And all other models installed on the remote host

**Requirements for remote Ollama:**

1. Remote Ollama must be running and accessible
2. Firewall must allow connections to port 11434
3. Models must be downloaded on the remote host

### URL Parameters

Override settings via URL query parameters:

```
http://localhost/?ws=wss://api.example.com/ag-ui/ws&session=my-session&token=your-token&ollama=http://100.94.136.15:11434
```

### Frontend Settings

You can also configure the Ollama host via the Settings panel in the web UI:

1. Click the ⚙️ Settings icon
2. Enter the Ollama host URL (e.g., `http://100.94.136.15:11434`)
3. Click Save

**Note:** The frontend setting is for display reference. The server must also be configured with the same Ollama host via the `OLLAMA_HOST` environment variable.

## Files

```
deploy/ag-ui-chat/
├── production-agui-chat.html  # Main application
├── nginx.conf                 # Nginx configuration
├── nginx-docker.conf          # Docker nginx configuration
├── Dockerfile                # Docker image
├── docker-compose.yml        # Docker Compose config
├── deploy.sh                # Automated deployment script
└── README.md                # This file
```

## Model Support

### ✅ Ollama Models (Fully Supported)

The AG-UI chat application **fully supports Ollama local models**. These models run entirely on your local machine and don't require any API keys or internet connection.

**Available Ollama Models:**

- `ollama/llama3` - Meta's Llama 3 (general purpose)
- `ollama/wizardcoder` - Code-specific model
- `ollama/qwen3:8b` - Alibaba's Qwen 3 (general purpose)
- `ollama/deepseek-r1:7b` - DeepSeek Reasoner (reasoning tasks)
- `ollama/mistral-nemo` - Mistral Nemo (general purpose)
- And more...

**Requirements for Ollama:**

1. Ollama must be installed and running on `localhost:11434`
2. Models must be downloaded: `ollama pull llama3`
3. Sufficient RAM for the model size

### ⚠️ Cloud Models (Limited Support)

Cloud models (OpenAI, Anthropic, Google, etc.) are **currently not supported** in this standalone deployment due to complex provider configuration requirements.

**Cloud models will show a fallback message:**

```
[model-name] Cloud models require API key configuration.
Please use Ollama models (ollama/*) for local inference,
or configure API keys for cloud providers.
```

**To enable cloud models:**
Cloud model support requires proper configuration of the OpenCode Provider system with:

- API keys for each cloud provider
- Provider configuration in the OpenCode models database
- Proper authentication setup

This is beyond the scope of a standalone deployment and requires the full OpenCode framework integration.

## Health Check

Access `http://localhost/health` to verify the service is running.

## Production Checklist

- [ ] Configure SSL/TLS certificate
- [ ] Set strong authentication token
- [ ] Configure firewall rules
- [ ] Set up monitoring/alerting
- [ ] Configure log rotation
- [ ] Set up backup strategy

## Troubleshooting

### WebSocket Connection Failed

1. Verify backend is running: `curl http://localhost:5000/ag-ui/ws`
2. Check firewall rules
3. Verify WebSocket URL configuration

### Authentication Failed

1. Ensure auth token is at least 10 characters
2. Check token matches backend expectations

### High Latency

1. Check network latency to WebSocket server
2. Consider deploying closer to backend
3. Enable compression (already configured in nginx)

## Support

For issues and questions, check the backend logs:

```bash
# For Docker deployment
docker-compose logs backend
```
