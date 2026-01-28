#!/bin/bash

# OPCUA Backend EC2 Instance Management Script
# Usage: ./manage-instance.sh {start|stop|status|ip|restart}

set -e

# Check if backend.env exists
if [ ! -f ../backend.env ]; then
  echo "❌ backend.env not found"
  echo "   Run ./deploy.sh first to create the instance"
  exit 1
fi

# Load instance ID
INSTANCE_ID=$(grep INSTANCE_ID ../backend.env | cut -d= -f2)

if [ -z "$INSTANCE_ID" ]; then
  echo "❌ INSTANCE_ID not found in backend.env"
  exit 1
fi

case "$1" in
  start)
    echo "🚀 Starting EC2 instance..."
    echo "   Instance ID: $INSTANCE_ID"
    aws ec2 start-instances --instance-ids $INSTANCE_ID > /dev/null

    echo "   Waiting for instance to be running..."
    aws ec2 wait instance-running --instance-ids $INSTANCE_ID

    # Get public IP
    IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID \
      --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

    echo ""
    echo "✅ Instance started successfully!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📍 Public IP:       $IP"
    echo "🌐 Backend URL:     http://$IP:3000"
    echo "📡 MQTT Broker:     mqtt://$IP:1883"
    echo "🔌 WebSocket URL:   ws://$IP:3000/socket.io/"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "⏳ Services will be available in ~2 minutes"
    echo "   (Docker Compose starts automatically on boot)"
    echo ""
    echo "Test health: curl http://$IP:3000/health"
    ;;

  stop)
    echo "⏸️  Stopping EC2 instance..."
    echo "   Instance ID: $INSTANCE_ID"

    # Get current state
    STATE=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID \
      --query 'Reservations[0].Instances[0].State.Name' --output text)

    if [ "$STATE" = "stopped" ]; then
      echo "   Instance is already stopped"
      exit 0
    fi

    aws ec2 stop-instances --instance-ids $INSTANCE_ID > /dev/null

    echo "   Waiting for instance to stop..."
    aws ec2 wait instance-stopped --instance-ids $INSTANCE_ID

    echo ""
    echo "✅ Instance stopped successfully!"
    echo "💰 You're now saving money!"
    echo ""
    echo "Cost while stopped:"
    echo "  - Compute: $0/hour"
    echo "  - Storage: ~$2-4/month (EBS persists)"
    echo "  - Elastic IP: $3.60/month (if configured)"
    echo ""
    echo "To restart: ./manage-instance.sh start"
    ;;

  status)
    echo "Checking instance status..."
    STATE=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID \
      --query 'Reservations[0].Instances[0].State.Name' --output text)

    INSTANCE_TYPE=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID \
      --query 'Reservations[0].Instances[0].InstanceType' --output text)

    IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID \
      --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Instance ID:    $INSTANCE_ID"
    echo "Status:         $STATE"
    echo "Instance Type:  $INSTANCE_TYPE"
    echo "Public IP:      ${IP:-N/A (stopped)}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    if [ "$STATE" = "running" ]; then
      echo "🌐 Backend URL:     http://$IP:3000"
      echo "📡 MQTT Broker:     mqtt://$IP:1883"
      echo "🔌 WebSocket URL:   ws://$IP:3000/socket.io/"
      echo ""
      echo "Test health: curl http://$IP:3000/health"
    fi
    ;;

  ip)
    STATE=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID \
      --query 'Reservations[0].Instances[0].State.Name' --output text)

    if [ "$STATE" != "running" ]; then
      echo "Instance is $STATE (not running)"
      echo "Start it first: ./manage-instance.sh start"
      exit 1
    fi

    IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID \
      --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

    echo "$IP"
    ;;

  restart)
    echo "🔄 Restarting EC2 instance..."
    $0 stop
    echo ""
    sleep 5
    $0 start
    ;;

  logs)
    IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID \
      --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

    if [ "$IP" = "None" ] || [ -z "$IP" ]; then
      echo "Instance is not running"
      exit 1
    fi

    echo "Connecting to instance to view logs..."
    echo "Press Ctrl+C to exit"
    echo ""
    ssh ec2-user@$IP 'cd /opt/opcua-backend && docker-compose logs -f'
    ;;

  ssh)
    IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID \
      --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

    if [ "$IP" = "None" ] || [ -z "$IP" ]; then
      echo "Instance is not running"
      exit 1
    fi

    echo "Connecting to instance via SSH..."
    ssh ec2-user@$IP
    ;;

  *)
    echo "OPCUA Backend Instance Management"
    echo ""
    echo "Usage: $0 {start|stop|status|ip|restart|logs|ssh}"
    echo ""
    echo "Commands:"
    echo "  start    - Start the EC2 instance"
    echo "  stop     - Stop the EC2 instance (saves money)"
    echo "  status   - Show instance status and details"
    echo "  ip       - Show public IP address"
    echo "  restart  - Restart the instance"
    echo "  logs     - View Docker Compose logs (SSH)"
    echo "  ssh      - Connect to instance via SSH"
    echo ""
    echo "Examples:"
    echo "  $0 start                    # Start instance"
    echo "  $0 stop                     # Stop to save money"
    echo "  $0 status                   # Check current status"
    echo "  $0 ip                       # Get IP for MQTT config"
    echo "  $0 logs                     # View application logs"
    echo ""
    exit 1
    ;;
esac
