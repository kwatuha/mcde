# Server Specifications for Government Projects Reporting and Information System (GPRIS)

## Overview
This document provides server specifications for optimal hosting of the Government Projects Reporting Platform, which consists of:
- **Frontend**: React.js SPA (Vite) served via Nginx
- **Backend**: Node.js/Express.js API
- **Database**: PostgreSQL
- **Reverse Proxy**: Nginx
- **Containerization**: Docker & Docker Compose

---

## Recommended Server Specifications

### 🎯 **Minimum Requirements** (Small Deployment)
*Suitable for: < 50 concurrent users, < 10,000 projects*

| Component | Specification |
|-----------|--------------|
| **CPU** | 2 cores (2 vCPU) |
| **RAM** | 4 GB |
| **Storage** | 50 GB SSD |
| **Network** | 100 Mbps |
| **OS** | Ubuntu 22.04 LTS or later |

**Estimated Cost**: $20-40/month (DigitalOcean, AWS, Azure)

---

### ⭐ **Recommended** (Medium Deployment)
*Suitable for: 50-200 concurrent users, 10,000-100,000 projects*

| Component | Specification |
|-----------|--------------|
| **CPU** | 4 cores (4 vCPU) |
| **RAM** | 8 GB |
| **Storage** | 100 GB SSD (with 20% free space for growth) |
| **Network** | 1 Gbps |
| **OS** | Ubuntu 22.04 LTS or later |

**Estimated Cost**: $60-120/month (DigitalOcean, AWS, Azure)

**Resource Allocation:**
- **PostgreSQL**: 2-3 GB RAM
- **Node.js API**: 1-2 GB RAM
- **Nginx**: 256 MB RAM
- **Frontend (Nginx)**: 128 MB RAM
- **System/OS**: 1 GB RAM
- **Buffer**: 1-2 GB RAM

---

### 🚀 **Optimal** (Large Deployment)
*Suitable for: 200-500 concurrent users, 100,000+ projects*

| Component | Specification |
|-----------|--------------|
| **CPU** | 8 cores (8 vCPU) |
| **RAM** | 16 GB |
| **Storage** | 200 GB SSD (with automated backups) |
| **Network** | 1 Gbps+ |
| **OS** | Ubuntu 22.04 LTS or later |

**Estimated Cost**: $150-300/month (DigitalOcean, AWS, Azure)

**Resource Allocation:**
- **PostgreSQL**: 4-6 GB RAM
- **Node.js API**: 2-4 GB RAM (with clustering)
- **Nginx**: 512 MB RAM
- **Frontend (Nginx)**: 256 MB RAM
- **System/OS**: 2 GB RAM
- **Buffer**: 3-4 GB RAM

---

### 🏢 **Enterprise** (High Availability)
*Suitable for: 500+ concurrent users, mission-critical deployment*

| Component | Specification |
|-----------|--------------|
| **CPU** | 16+ cores (16+ vCPU) |
| **RAM** | 32 GB+ |
| **Storage** | 500 GB+ SSD (RAID 10, automated backups) |
| **Network** | 10 Gbps+ |
| **OS** | Ubuntu 22.04 LTS or later |
| **Architecture** | Load-balanced, multi-server setup |

**Estimated Cost**: $500-1000+/month

**Recommended Architecture:**
- **Load Balancer**: Separate server or managed service
- **Frontend Servers**: 2+ servers (4 vCPU, 8 GB RAM each)
- **API Servers**: 2+ servers (4 vCPU, 8 GB RAM each)
- **Database Server**: Dedicated (8 vCPU, 16 GB RAM, SSD storage)
- **File Storage**: Separate object storage (S3, DigitalOcean Spaces)

---

## Detailed Component Requirements

### 1. **PostgreSQL Database**

#### Minimum Configuration:
```sql
max_connections = 100
shared_buffers = 1GB
effective_cache_size = 3GB
maintenance_work_mem = 256MB
work_mem = 16MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
```

#### Recommended Configuration (8 GB RAM):
```sql
max_connections = 200
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
work_mem = 32MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
```

#### Storage Requirements:
- **Base**: 10-20 GB for application data
- **Growth**: ~1-5 GB per 10,000 projects (with photos, documents)
- **Backups**: 2x data size (recommended)
- **Logs**: 5-10 GB for PostgreSQL logs

**Total Storage**: Base + Growth + Backups + Logs + 20% buffer

---

### 2. **Node.js API Server**

#### Memory Requirements:
- **Base**: 200-300 MB
- **Per Request**: ~10-50 MB (depends on file processing)
- **Puppeteer (PDF generation)**: 100-200 MB per instance
- **Socket.io**: ~50 MB

**Total**: 500 MB - 2 GB (depending on concurrent requests)

#### CPU Requirements:
- **Base**: 0.5-1 core
- **File Processing**: 1-2 cores (Puppeteer, Excel parsing)
- **Concurrent Requests**: 0.1-0.5 cores per 10 concurrent users

**Total**: 2-4 cores recommended for medium deployment

#### Process Management:
- Use **PM2** or **Docker restart policies** for process management
- Consider **Node.js clustering** for multi-core utilization
- Set **memory limits** to prevent OOM errors

---

### 3. **Frontend (Nginx)**

#### Memory Requirements:
- **Nginx**: 50-100 MB
- **Static Files**: Minimal (served from disk)

#### CPU Requirements:
- **Minimal**: < 0.1 core (static file serving is very efficient)

#### Storage Requirements:
- **Build Output**: 50-200 MB (compressed production build)
- **Assets**: 10-50 MB (images, fonts)

---

### 4. **Nginx Reverse Proxy**

#### Memory Requirements:
- **Base**: 50-100 MB
- **Caching**: 100-500 MB (if enabled)

#### CPU Requirements:
- **Minimal**: < 0.5 core (reverse proxy is very efficient)

---

## Network Requirements

### Bandwidth Calculation:
- **Average Page Load**: ~500 KB - 2 MB
- **API Request**: ~10-100 KB
- **File Upload**: Variable (depends on user)

**Formula**: `(Concurrent Users × Average Page Size × Page Views per Minute) + API Traffic`

**Example (100 concurrent users)**:
- Page views: 100 users × 1 MB × 2 pages/min = 200 MB/min = 3.3 MB/s = **~27 Mbps**
- API traffic: ~10-20% additional = **~5 Mbps**
- **Total**: ~35 Mbps minimum, **100 Mbps recommended**

---

## Storage Requirements

### Application Files:
- **Codebase**: 500 MB - 1 GB
- **Docker Images**: 2-3 GB
- **Node Modules**: 500 MB - 1 GB
- **Build Artifacts**: 200-500 MB

### Database:
- **Base Data**: 10-20 GB
- **Growth Rate**: ~1-5 GB per 10,000 projects
- **Indexes**: ~20-30% of data size

### User Uploads:
- **Photos**: ~1-5 MB per photo
- **Documents**: ~100 KB - 10 MB per document
- **Estimated**: 10-50 GB for 10,000 projects with media

### Logs:
- **Application Logs**: 1-5 GB
- **PostgreSQL Logs**: 5-10 GB
- **Nginx Logs**: 1-2 GB
- **Docker Logs**: 1-2 GB

### Backups:
- **Database Backups**: 2x data size
- **File Backups**: 1x upload size
- **Retention**: 7-30 days recommended

**Total Storage (Medium Deployment)**:
- **Minimum**: 50 GB
- **Recommended**: 100 GB (with 20% free space)
- **With Backups**: 150-200 GB

---

## Operating System & Software

### Recommended OS:
- **Ubuntu 22.04 LTS** or **Ubuntu 24.04 LTS**
- **Alternative**: RHEL 9, CentOS Stream 9, Debian 12

### Required Software:
- **Docker**: 24.0+ (Docker Engine or Docker Desktop)
- **Docker Compose**: 2.20+
- **PostgreSQL**: 14+ (if not using Docker)
- **Nginx**: 1.22+ (system-level, for reverse proxy)
- **Node.js**: 18+ (for local development/builds)

### System Packages:
```bash
# Essential packages
sudo apt-get update
sudo apt-get install -y \
    curl \
    wget \
    git \
    vim \
    htop \
    net-tools \
    ufw \
    fail2ban \
    certbot \
    python3-certbot-nginx
```

---

## Security Considerations

### Firewall Configuration:
- **SSH**: Port 22 (restrict to specific IPs)
- **HTTP**: Port 80
- **HTTPS**: Port 443
- **API**: Port 3001 (internal only, not exposed publicly)
- **PostgreSQL**: Port 5432 (internal only, not exposed publicly)

### SSL/TLS:
- **Let's Encrypt** certificate (free, auto-renewal)
- **HTTPS redirect** for all traffic
- **HSTS** headers enabled

### Monitoring:
- **Uptime Monitoring**: UptimeRobot, Pingdom
- **Log Monitoring**: Logwatch, ELK Stack (optional)
- **Resource Monitoring**: htop, netdata, Prometheus (optional)

---

## Backup Strategy

### Database Backups:
- **Frequency**: Daily (full backup) + Hourly (WAL archiving)
- **Retention**: 7-30 days
- **Storage**: Separate volume or cloud storage (S3, Backblaze)

### File Backups:
- **Frequency**: Daily
- **Retention**: 7-30 days
- **Storage**: Separate volume or cloud storage

### Backup Script Example:
```bash
# Daily PostgreSQL backup
pg_dump -U postgres government_projects | gzip > /backups/db_$(date +%Y%m%d).sql.gz

# Cleanup old backups (keep 30 days)
find /backups -name "db_*.sql.gz" -mtime +30 -delete
```

---

## Performance Optimization

### PostgreSQL:
- **Indexes**: Ensure indexes on frequently queried columns
- **VACUUM**: Regular VACUUM and ANALYZE
- **Connection Pooling**: Use PgBouncer for high concurrency

### Node.js API:
- **Caching**: Redis for session storage and API caching
- **Compression**: Enable gzip compression
- **Clustering**: Use Node.js cluster module for multi-core

### Nginx:
- **Gzip Compression**: Enable for text files
- **Caching**: Cache static assets (24-48 hours)
- **Rate Limiting**: Prevent abuse

### Frontend:
- **CDN**: Use CDN for static assets (optional)
- **Lazy Loading**: Code splitting and lazy loading
- **Image Optimization**: Compress images before upload

---

## Monitoring & Maintenance

### Key Metrics to Monitor:
- **CPU Usage**: < 70% average
- **Memory Usage**: < 80% average
- **Disk Usage**: < 80% capacity
- **Database Connections**: < 80% of max_connections
- **Response Time**: < 500ms (API), < 2s (page load)
- **Error Rate**: < 1%

### Maintenance Tasks:
- **Weekly**: Review logs, check disk space
- **Monthly**: Update system packages, review security
- **Quarterly**: Database optimization, backup testing

---

## Cloud Provider Recommendations

### DigitalOcean:
- **Recommended**: Droplet (4 vCPU, 8 GB RAM, 100 GB SSD) - $48/month
- **Pros**: Simple pricing, good documentation, fast setup
- **Cons**: Limited global regions

### AWS (EC2):
- **Recommended**: t3.xlarge (4 vCPU, 16 GB RAM) - ~$120/month
- **Pros**: Global infrastructure, extensive services
- **Cons**: Complex pricing, steeper learning curve

### Azure:
- **Recommended**: Standard_D4s_v3 (4 vCPU, 16 GB RAM) - ~$150/month
- **Pros**: Enterprise integration, good for Windows shops
- **Cons**: Higher cost, complex pricing

### Hetzner:
- **Recommended**: CPX31 (4 vCPU, 8 GB RAM, 160 GB SSD) - €12.90/month
- **Pros**: Excellent price/performance, European data centers
- **Cons**: Limited support, fewer regions

---

## Scaling Strategy

### Vertical Scaling (Single Server):
- **Easy**: Upgrade CPU/RAM/Storage
- **Limitation**: Single point of failure
- **Best For**: Small to medium deployments

### Horizontal Scaling (Multiple Servers):
- **Load Balancer**: Distribute traffic across multiple API servers
- **Database**: Read replicas for read-heavy workloads
- **File Storage**: Object storage (S3, Spaces) for user uploads
- **Best For**: Large deployments, high availability

---

## Cost Estimation Summary

| Deployment Size | Monthly Cost (USD) | Provider Examples |
|----------------|-------------------|-------------------|
| **Minimum** | $20-40 | DigitalOcean 2GB, Hetzner CPX11 |
| **Recommended** | $60-120 | DigitalOcean 8GB, AWS t3.large |
| **Optimal** | $150-300 | DigitalOcean 16GB, AWS t3.xlarge |
| **Enterprise** | $500-1000+ | Multi-server setup, managed services |

---

## Quick Start Checklist

- [ ] Provision server with recommended specifications
- [ ] Install Ubuntu 22.04 LTS
- [ ] Install Docker and Docker Compose
- [ ] Configure firewall (UFW)
- [ ] Set up SSL certificate (Let's Encrypt)
- [ ] Configure PostgreSQL (if not using Docker)
- [ ] Deploy application using deployment script
- [ ] Set up automated backups
- [ ] Configure monitoring
- [ ] Test failover and recovery procedures

---

## Support & Documentation

For deployment assistance, refer to:
- `deploy-machos-server.sh` - Deployment script
- `docker-compose.prod.yml` - Production Docker configuration
- `nginx/nginx-production.conf` - Nginx configuration

---

**Last Updated**: 2026-03-07
**Version**: 1.0
