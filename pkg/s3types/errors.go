package s3types

import (
	"encoding/xml"
	"fmt"
	"net/http"
)

// ErrorResponse is the XML structure returned for S3 errors.
type ErrorResponse struct {
	XMLName   xml.Name `xml:"Error"`
	Code      string   `xml:"Code"`
	Message   string   `xml:"Message"`
	Resource  string   `xml:"Resource,omitempty"`
	RequestId string   `xml:"RequestId,omitempty"`
}

// S3Error represents an S3-compatible error with HTTP status code.
type S3Error struct {
	Code       string
	Message    string
	StatusCode int
	Resource   string
}

func (e *S3Error) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// WithResource returns a copy of the error with the resource field set.
func (e *S3Error) WithResource(resource string) *S3Error {
	return &S3Error{
		Code:       e.Code,
		Message:    e.Message,
		StatusCode: e.StatusCode,
		Resource:   resource,
	}
}

// WithMessage returns a copy of the error with a custom message.
func (e *S3Error) WithMessage(msg string) *S3Error {
	return &S3Error{
		Code:       e.Code,
		Message:    msg,
		StatusCode: e.StatusCode,
		Resource:   e.Resource,
	}
}

// Standard S3 error codes.
var (
	ErrAccessDenied = &S3Error{
		Code: "AccessDenied", Message: "Access Denied",
		StatusCode: http.StatusForbidden,
	}
	ErrBucketAlreadyExists = &S3Error{
		Code: "BucketAlreadyExists", Message: "The requested bucket name is not available.",
		StatusCode: http.StatusConflict,
	}
	ErrBucketAlreadyOwnedByYou = &S3Error{
		Code: "BucketAlreadyOwnedByYou", Message: "Your previous request to create the named bucket succeeded and you already own it.",
		StatusCode: http.StatusConflict,
	}
	ErrBucketNotEmpty = &S3Error{
		Code: "BucketNotEmpty", Message: "The bucket you tried to delete is not empty.",
		StatusCode: http.StatusConflict,
	}
	ErrEntityTooLarge = &S3Error{
		Code: "EntityTooLarge", Message: "Your proposed upload exceeds the maximum allowed object size.",
		StatusCode: http.StatusBadRequest,
	}
	ErrEntityTooSmall = &S3Error{
		Code: "EntityTooSmall", Message: "Your proposed upload is smaller than the minimum allowed object size.",
		StatusCode: http.StatusBadRequest,
	}
	ErrIllegalVersioningConfiguration = &S3Error{
		Code: "IllegalVersioningConfigurationException", Message: "The versioning configuration specified in the request is invalid.",
		StatusCode: http.StatusBadRequest,
	}
	ErrIncompleteBody = &S3Error{
		Code: "IncompleteBody", Message: "You did not provide the number of bytes specified by the Content-Length HTTP header.",
		StatusCode: http.StatusBadRequest,
	}
	ErrInternalError = &S3Error{
		Code: "InternalError", Message: "We encountered an internal error. Please try again.",
		StatusCode: http.StatusInternalServerError,
	}
	ErrInvalidArgument = &S3Error{
		Code: "InvalidArgument", Message: "Invalid Argument.",
		StatusCode: http.StatusBadRequest,
	}
	ErrInvalidBucketName = &S3Error{
		Code: "InvalidBucketName", Message: "The specified bucket is not valid.",
		StatusCode: http.StatusBadRequest,
	}
	ErrInvalidDigest = &S3Error{
		Code: "InvalidDigest", Message: "The Content-MD5 you specified is not valid.",
		StatusCode: http.StatusBadRequest,
	}
	ErrInvalidPart = &S3Error{
		Code: "InvalidPart", Message: "One or more of the specified parts could not be found.",
		StatusCode: http.StatusBadRequest,
	}
	ErrInvalidPartOrder = &S3Error{
		Code: "InvalidPartOrder", Message: "The list of parts was not in ascending order.",
		StatusCode: http.StatusBadRequest,
	}
	ErrInvalidRange = &S3Error{
		Code: "InvalidRange", Message: "The requested range cannot be satisfied.",
		StatusCode: http.StatusRequestedRangeNotSatisfiable,
	}
	ErrInvalidRequest = &S3Error{
		Code: "InvalidRequest", Message: "Invalid Request.",
		StatusCode: http.StatusBadRequest,
	}
	ErrKeyTooLong = &S3Error{
		Code: "KeyTooLongError", Message: "Your key is too long.",
		StatusCode: http.StatusBadRequest,
	}
	ErrMalformedACLError = &S3Error{
		Code: "MalformedACLError", Message: "The ACL that you provided was not well-formed.",
		StatusCode: http.StatusBadRequest,
	}
	ErrMalformedPolicy = &S3Error{
		Code: "MalformedPolicy", Message: "The policy that you provided was not well-formed.",
		StatusCode: http.StatusBadRequest,
	}
	ErrMalformedXML = &S3Error{
		Code: "MalformedXML", Message: "The XML you provided was not well-formed.",
		StatusCode: http.StatusBadRequest,
	}
	ErrMethodNotAllowed = &S3Error{
		Code: "MethodNotAllowed", Message: "The specified method is not allowed against this resource.",
		StatusCode: http.StatusMethodNotAllowed,
	}
	ErrMissingContentLength = &S3Error{
		Code: "MissingContentLength", Message: "You must provide the Content-Length HTTP header.",
		StatusCode: http.StatusLengthRequired,
	}
	ErrNoSuchBucket = &S3Error{
		Code: "NoSuchBucket", Message: "The specified bucket does not exist.",
		StatusCode: http.StatusNotFound,
	}
	ErrNoSuchKey = &S3Error{
		Code: "NoSuchKey", Message: "The specified key does not exist.",
		StatusCode: http.StatusNotFound,
	}
	ErrNoSuchUpload = &S3Error{
		Code: "NoSuchUpload", Message: "The specified multipart upload does not exist.",
		StatusCode: http.StatusNotFound,
	}
	ErrNoSuchVersion = &S3Error{
		Code: "NoSuchVersion", Message: "The specified version does not exist.",
		StatusCode: http.StatusNotFound,
	}
	ErrNoSuchBucketPolicy = &S3Error{
		Code: "NoSuchBucketPolicy", Message: "The bucket policy does not exist.",
		StatusCode: http.StatusNotFound,
	}
	ErrNoSuchLifecycleConfiguration = &S3Error{
		Code: "NoSuchLifecycleConfiguration", Message: "The lifecycle configuration does not exist.",
		StatusCode: http.StatusNotFound,
	}
	ErrPreconditionFailed = &S3Error{
		Code: "PreconditionFailed", Message: "At least one of the preconditions you specified did not hold.",
		StatusCode: http.StatusPreconditionFailed,
	}
	ErrSignatureDoesNotMatch = &S3Error{
		Code: "SignatureDoesNotMatch", Message: "The request signature we calculated does not match the signature you provided.",
		StatusCode: http.StatusForbidden,
	}
	ErrInvalidAccessKeyId = &S3Error{
		Code: "InvalidAccessKeyId", Message: "The AWS Access Key Id you provided does not exist in our records.",
		StatusCode: http.StatusForbidden,
	}
	ErrRequestTimeTooSkewed = &S3Error{
		Code: "RequestTimeTooSkewed", Message: "The difference between the request time and the server's time is too large.",
		StatusCode: http.StatusForbidden,
	}
	ErrExpiredPresignedRequest = &S3Error{
		Code: "AccessDenied", Message: "Request has expired.",
		StatusCode: http.StatusForbidden,
	}
	ErrAuthorizationHeaderMalformed = &S3Error{
		Code: "AuthorizationHeaderMalformed", Message: "The authorization header is malformed.",
		StatusCode: http.StatusBadRequest,
	}
	ErrMissingSecurityHeader = &S3Error{
		Code: "MissingSecurityHeader", Message: "Your request is missing a required header.",
		StatusCode: http.StatusBadRequest,
	}
	ErrNotImplemented = &S3Error{
		Code: "NotImplemented", Message: "A header you provided implies functionality that is not implemented.",
		StatusCode: http.StatusNotImplemented,
	}
)
