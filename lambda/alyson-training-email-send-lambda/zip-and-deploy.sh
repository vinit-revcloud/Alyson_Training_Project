#!/bin/bash

set -e

# Run from lambda dir: cd lambda/alyson-training-email-send-lambda && ./zip-and-deploy.sh

### CONFIG ###
LAMBDA_FUNCTION_NAME="alyson-training-email-send-lambda"
AWS_REGION="us-west-2"
ZIP_NAME="handler.zip"
LAMBDA_DEPLOY_BUCKET="${LAMBDA_DEPLOY_BUCKET:-datalake-landingzone-221490242148-us-west-2}"

### PATHS ###
CURRENT_DIR="$(pwd)"
PARENT_DIR="$(dirname "$CURRENT_DIR")"
ZIP_PATH="$PARENT_DIR/$ZIP_NAME"

echo "Installing production dependencies..."
npm install --omit=dev

echo "Zipping Lambda from: $CURRENT_DIR"
echo "Output zip: $ZIP_PATH"

rm -f "$ZIP_PATH"

zip -r "$ZIP_PATH" . \
  -x ".env" \
  -x "package-lock.json" \
  -x "pnpm-lock.yaml" \
  -x "state-machine/*" \
  -x "README.md" \
  -x "*.md" \
  -x "zip-and-deploy.sh" \
  -x "test-endpoints.sh" \
  -x "*.zip"

ZIP_SIZE_H=$(ls -lh "$ZIP_PATH" | awk '{print $5}')
echo "Zip size: $ZIP_SIZE_H"

if [ -n "$LAMBDA_DEPLOY_BUCKET" ]; then
  S3_KEY="alyson-training/${LAMBDA_FUNCTION_NAME}/$(date +%Y%m%d-%H%M%S).zip"
  echo "Uploading zip to s3://$LAMBDA_DEPLOY_BUCKET/$S3_KEY"
  aws s3 cp "$ZIP_PATH" "s3://$LAMBDA_DEPLOY_BUCKET/$S3_KEY" --region "$AWS_REGION"
  echo "Updating Lambda code from S3: $LAMBDA_FUNCTION_NAME"
  aws lambda update-function-code \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --s3-bucket "$LAMBDA_DEPLOY_BUCKET" \
    --s3-key "$S3_KEY" \
    --region "$AWS_REGION" \
    --no-cli-pager
else
  echo "Updating Lambda code (direct upload; set LAMBDA_DEPLOY_BUCKET to use S3 if it hangs)"
  aws lambda update-function-code \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_PATH" \
    --region "$AWS_REGION" \
    --no-cli-pager
fi

echo "Waiting for Lambda update to complete..."

aws lambda wait function-updated \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --region "$AWS_REGION"

echo "Deployment complete"
