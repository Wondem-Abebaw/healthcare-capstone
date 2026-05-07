"""
MinIO storage service — production-grade S3-compatible replacement for GCS.
Same boto3 interface, just pointed at local MinIO. Swap MINIO_ENDPOINT for
any S3-compatible service (Backblaze B2, Wasabi, AWS S3) in production.
"""
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import io
import structlog
from app.core.config import get_settings

log = structlog.get_logger()
settings = get_settings()

_s3_client = None


def get_s3():
    global _s3_client
    if _s3_client is None:
        protocol = "https" if settings.minio_secure else "http"
        _s3_client = boto3.client(
            "s3",
            endpoint_url=f"{protocol}://{settings.minio_endpoint}",
            aws_access_key_id=settings.minio_access_key,
            aws_secret_access_key=settings.minio_secret_key,
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",  # MinIO ignores this but boto3 requires it
        )
    return _s3_client


async def upload_file(
    bucket: str,
    key: str,
    data: bytes,
    content_type: str = "application/octet-stream",
    metadata: dict | None = None,
) -> str:
    """Upload bytes to MinIO. Returns the object key."""
    s3 = get_s3()
    extra_args = {"ContentType": content_type}
    if metadata:
        extra_args["Metadata"] = {k: str(v) for k, v in metadata.items()}

    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=data,
        **extra_args,
    )
    log.info("storage.upload", bucket=bucket, key=key, size=len(data))
    return key


async def download_file(bucket: str, key: str) -> bytes:
    """Download object from MinIO."""
    s3 = get_s3()
    response = s3.get_object(Bucket=bucket, Key=key)
    data = response["Body"].read()
    log.info("storage.download", bucket=bucket, key=key, size=len(data))
    return data


async def get_presigned_url(bucket: str, key: str, expires: int = 3600) -> str:
    """Generate a presigned URL for temporary direct access."""
    s3 = get_s3()
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires,
    )
    return url


async def delete_object(bucket: str, key: str) -> None:
    s3 = get_s3()
    s3.delete_object(Bucket=bucket, Key=key)
    log.info("storage.delete", bucket=bucket, key=key)


async def list_objects(bucket: str, prefix: str = "") -> list[dict]:
    s3 = get_s3()
    response = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
    return [
        {
            "key": obj["Key"],
            "size": obj["Size"],
            "last_modified": obj["LastModified"].isoformat(),
        }
        for obj in response.get("Contents", [])
    ]


def object_exists(bucket: str, key: str) -> bool:
    s3 = get_s3()
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError:
        return False
