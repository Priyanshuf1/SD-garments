#!/bin/bash
# ==============================================================================
# ALLEYRICH D2C Streetwear - End-to-End AWS Automated Infrastructure Deployment
# Provisions: VPC Discovery, Security Groups, EC2 Docker Server, Target Group, ALB
# ==============================================================================

set -e

echo "======================================================================"
echo "🚀 Starting ALLEYRICH Automated AWS Infrastructure Provisioning"
echo "======================================================================"

# 1. Detect Active AWS Region
REGION=$(aws configure get region || true)
if [ -z "$REGION" ]; then
  REGION="ap-south-1"
fi
echo "📍 Using AWS Region: $REGION"

# 2. Find the Custom VPC (allyrich-prod-vpc)
echo "🔍 Discovering allyrich-prod-vpc..."
VPC_ID=$(aws ec2 describe-vpcs --region "$REGION" \
  --filters "Name=tag:Name,Values=*allyrich-prod*" \
  --query "Vpcs[0].VpcId" --output text)

if [ "$VPC_ID" == "None" ] || [ -z "$VPC_ID" ]; then
  echo "❌ Error: Could not find VPC matching 'allyrich-prod'. Please verify it exists."
  exit 1
fi
echo "✅ Found VPC: $VPC_ID"

# 3. Discover Public Subnets in 2 Distinct Availability Zones
echo "🔍 Discovering Public Subnets for Load Balancer..."
PUBLIC_SUBNETS=($(aws ec2 describe-subnets --region "$REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=*public*" \
  --query "Subnets[*].SubnetId" --output text))

if [ ${#PUBLIC_SUBNETS[@]} -lt 2 ]; then
  # Fallback to all subnets in the VPC
  PUBLIC_SUBNETS=($(aws ec2 describe-subnets --region "$REGION" \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query "Subnets[*].SubnetId" --output text))
fi

SUBNET_1=${PUBLIC_SUBNETS[0]}
SUBNET_2=${PUBLIC_SUBNETS[1]}

echo "✅ Using Subnet A: $SUBNET_1"
echo "✅ Using Subnet B: $SUBNET_2"

# Enable auto-assign public IP on Subnet 1 & 2
aws ec2 modify-subnet-attribute --region "$REGION" --subnet-id "$SUBNET_1" --map-public-ip-on-launch
aws ec2 modify-subnet-attribute --region "$REGION" --subnet-id "$SUBNET_2" --map-public-ip-on-launch

# 4. Create / Verify Load Balancer Security Group (allyrich-alb-sg)
echo "🛡️ Configuring Load Balancer Security Group (allyrich-alb-sg)..."
ALB_SG_ID=$(aws ec2 describe-security-groups --region "$REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=allyrich-alb-sg" \
  --query "SecurityGroups[0].GroupId" --output text || true)

if [ "$ALB_SG_ID" == "None" ] || [ -z "$ALB_SG_ID" ]; then
  ALB_SG_ID=$(aws ec2 create-security-group --region "$REGION" \
    --group-name "allyrich-alb-sg" \
    --description "Public ALB security group" \
    --vpc-id "$VPC_ID" --output text --query "GroupId")
  echo "✅ Created ALB Security Group: $ALB_SG_ID"

  # Allow HTTP (Port 80) and HTTPS (Port 443) from anywhere
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$ALB_SG_ID" \
    --protocol tcp --port 80 --cidr 0.0.0.0/0
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$ALB_SG_ID" \
    --protocol tcp --port 443 --cidr 0.0.0.0/0
else
  echo "ℹ️ ALB Security Group already exists: $ALB_SG_ID"
fi

# 5. Create / Verify EC2 Security Group (allyrich-ec2-sg)
echo "🛡️ Configuring EC2 Security Group (allyrich-ec2-sg)..."
EC2_SG_ID=$(aws ec2 describe-security-groups --region "$REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=allyrich-ec2-sg" \
  --query "SecurityGroups[0].GroupId" --output text || true)

if [ "$EC2_SG_ID" == "None" ] || [ -z "$EC2_SG_ID" ]; then
  EC2_SG_ID=$(aws ec2 create-security-group --region "$REGION" \
    --group-name "allyrich-ec2-sg" \
    --description "EC2 server security group" \
    --vpc-id "$VPC_ID" --output text --query "GroupId")
  echo "✅ Created EC2 Security Group: $EC2_SG_ID"

  # Allow SSH from anywhere (or home IP)
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$EC2_SG_ID" \
    --protocol tcp --port 22 --cidr 0.0.0.0/0

  # Allow Port 3000 ONLY from the ALB Security Group (Chaining)
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$EC2_SG_ID" \
    --protocol tcp --port 3000 --source-group "$ALB_SG_ID"
else
  echo "ℹ️ EC2 Security Group already exists: $EC2_SG_ID"
fi

# 6. Create / Verify SSH Key Pair (allyrich-key)
echo "🔑 Checking SSH Key Pair..."
KEY_CHECK=$(aws ec2 describe-key-pairs --region "$REGION" \
  --filters "Name=key-name,Values=allyrich-key" \
  --query "KeyPairs[0].KeyName" --output text || true)

if [ "$KEY_CHECK" == "None" ] || [ -z "$KEY_CHECK" ]; then
  echo "Creating new SSH Key Pair: allyrich-key..."
  aws ec2 create-key-pair --region "$REGION" \
    --key-name "allyrich-key" \
    --query "KeyMaterial" --output text > ~/allyrich-key.pem
  chmod 400 ~/allyrich-key.pem
  echo "✅ SSH Key saved to ~/allyrich-key.pem"
else
  echo "ℹ️ SSH Key 'allyrich-key' already exists in AWS."
fi

# 7. Get Latest Ubuntu 22.04 LTS AMI ID
echo "🔍 Resolving latest Ubuntu 22.04 LTS AMI..."
AMI_ID=$(aws ssm get-parameter --region "$REGION" \
  --name "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id" \
  --query "Parameter.Value" --output text)
echo "✅ Using AMI: $AMI_ID"

# 8. Launch EC2 Instance with Automated Docker Bootstrap
echo "🚀 Launching EC2 Instance (allyrich-app-server)..."
INSTANCE_CHECK=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=allyrich-app-server" "Name=instance-state-name,Values=running,pending" \
  --query "Reservations[0].Instances[0].InstanceId" --output text || true)

if [ "$INSTANCE_CHECK" == "None" ] || [ -z "$INSTANCE_CHECK" ]; then
  # Prepare User Data Script to install Docker and launch ALLEYRICH automatically
  USER_DATA=$(cat << 'EOF' | base64
#!/bin/bash
apt-get update -y
apt-get install -y git curl wget
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker ubuntu

cd /home/ubuntu
git clone https://github.com/Priyanshuf1/SD-garments.git
cd SD-garments
chown -R ubuntu:ubuntu /home/ubuntu/SD-garments
docker compose up -d --build
EOF
)

  INSTANCE_ID=$(aws ec2 run-instances --region "$REGION" \
    --image-id "$AMI_ID" \
    --instance-type "t2.micro" \
    --key-name "allyrich-key" \
    --security-group-ids "$EC2_SG_ID" \
    --subnet-id "$SUBNET_1" \
    --user-data "$USER_DATA" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=allyrich-app-server}]" \
    --query "Instances[0].InstanceId" --output text)
  echo "✅ Launched EC2 Instance: $INSTANCE_ID"
else
  INSTANCE_ID="$INSTANCE_CHECK"
  echo "ℹ️ EC2 Instance already running: $INSTANCE_ID"
fi

# 9. Create Target Group (allyrich-tg-3000)
echo "🎯 Configuring Target Group (allyrich-tg-3000)..."
TG_ARN=$(aws elbv2 describe-target-groups --region "$REGION" \
  --names "allyrich-tg-3000" --query "TargetGroups[0].TargetGroupArn" --output text 2>/dev/null || true)

if [ -z "$TG_ARN" ]; then
  TG_ARN=$(aws elbv2 create-target-group --region "$REGION" \
    --name "allyrich-tg-3000" \
    --protocol HTTP \
    --port 3000 \
    --vpc-id "$VPC_ID" \
    --health-check-protocol HTTP \
    --health-check-path "/api/health" \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --target-type instance \
    --query "TargetGroups[0].TargetGroupArn" --output text)
  echo "✅ Created Target Group: $TG_ARN"
else
  echo "ℹ️ Target Group already exists: $TG_ARN"
fi

# Register EC2 instance with Target Group
echo "Registering EC2 $INSTANCE_ID into Target Group..."
aws elbv2 register-targets --region "$REGION" \
  --target-group-arn "$TG_ARN" \
  --targets Id="$INSTANCE_ID",Port=3000
echo "✅ EC2 registered into Target Group."

# 10. Create Application Load Balancer (allyrich-alb)
echo "⚖️ Configuring Application Load Balancer (allyrich-alb)..."
ALB_ARN=$(aws elbv2 describe-load-balancers --region "$REGION" \
  --names "allyrich-alb" --query "LoadBalancers[0].LoadBalancerArn" --output text 2>/dev/null || true)

if [ -z "$ALB_ARN" ]; then
  ALB_OUTPUT=$(aws elbv2 create-load-balancer --region "$REGION" \
    --name "allyrich-alb" \
    --subnets "$SUBNET_1" "$SUBNET_2" \
    --security-groups "$ALB_SG_ID" \
    --scheme internet-facing \
    --type application)
  ALB_ARN=$(echo "$ALB_OUTPUT" | jq -r '.LoadBalancers[0].LoadBalancerArn')
  ALB_DNS=$(echo "$ALB_OUTPUT" | jq -r '.LoadBalancers[0].DNSName')
  echo "✅ Created Application Load Balancer: $ALB_DNS"
else
  ALB_DNS=$(aws elbv2 describe-load-balancers --region "$REGION" \
    --names "allyrich-alb" --query "LoadBalancers[0].DNSName" --output text)
  echo "ℹ️ Application Load Balancer already exists: $ALB_DNS"
fi

# 11. Create HTTP Listener on Port 80 (Forwarding to Target Group)
echo "🎧 Configuring Port 80 Listener on Load Balancer..."
LISTENER_CHECK=$(aws elbv2 describe-listeners --region "$REGION" \
  --load-balancer-arn "$ALB_ARN" --query "Listeners[0].ListenerArn" --output text 2>/dev/null || true)

if [ "$LISTENER_CHECK" == "None" ] || [ -z "$LISTENER_CHECK" ]; then
  aws elbv2 create-listener --region "$REGION" \
    --load-balancer-arn "$ALB_ARN" \
    --protocol HTTP --port 80 \
    --default-actions Type=forward,TargetGroupArn="$TG_ARN" >/dev/null
  echo "✅ Port 80 Listener created."
else
  echo "ℹ️ Listener already configured on ALB."
fi

# 12. Final Output Summary
echo ""
echo "======================================================================"
echo "🎉 DEPLOYMENT COMPLETE! AWS INFRASTRUCTURE IS LIVE!"
echo "======================================================================"
echo "🌐 Load Balancer URL: http://$ALB_DNS"
echo "🖥️ EC2 Instance ID:   $INSTANCE_ID"
echo "🛡️ ALB Security Group: $ALB_SG_ID"
echo "🛡️ EC2 Security Group: $EC2_SG_ID"
echo "🎯 Target Group ARN:  $TG_ARN"
echo "======================================================================"
echo "👉 Open in your browser: http://$ALB_DNS"
echo "*(Note: Allow 2-3 minutes for Docker container to finish cloning and building)*"
