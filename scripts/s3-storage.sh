#!/bin/sh
set -eu

aws --endpoint-url http://s3:9000 s3api head-bucket --bucket substrate-private 2>/dev/null || aws --endpoint-url http://s3:9000 s3api create-bucket --bucket substrate-private
aws --endpoint-url http://s3:9000 s3api put-public-access-block --bucket substrate-private --public-access-block-configuration '{"BlockPublicAcls":true,"IgnorePublicAcls":true,"BlockPublicPolicy":true,"RestrictPublicBuckets":true}'
aws --endpoint-url http://s3:9000 s3api put-bucket-cors --bucket substrate-private --cors-configuration '{"CORSRules":[{"AllowedOrigins":["http://localhost:3000","http://localhost:3100","http://localhost:8081","https://desktop.substrate.local","https://app.substrate.local"],"AllowedMethods":["PUT","GET","HEAD"],"AllowedHeaders":["content-type","content-length","x-amz-*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":600}]}'
aws --endpoint-url http://s3:9000 s3api put-bucket-lifecycle-configuration --bucket substrate-private --lifecycle-configuration '{"Rules":[{"ID":"expire-temporary-uploads","Status":"Enabled","Filter":{"Prefix":"temporary/"},"Expiration":{"Days":1},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":1}}]}'
