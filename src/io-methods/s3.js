"use strict";

const aws = require("aws-sdk"),
  config = require("../config").config,
  jsHelpers = require("./js-file-helpers.js");

if (config && config.region) {
  aws.config.update({ region: config.region });
}
const { getCacheControl } = require("../cache-control");

function parseFilePath(filePath) {
  const prefix = isDigitalOcean(filePath) ? "spaces://" : "s3://";
  const file = filePath.split(prefix)[1];
  const bucketDelimiter = isDigitalOcean(filePath) ? "." : "/";
  const bucket = file.substr(0, file.indexOf(bucketDelimiter));
  const key = file.substr(file.indexOf("/") + 1);

  return {
    bucket,
    key,
  };
}

let s3PutObjectCacheControl;
let s3PutObjectConfigSansCacheControl = {};
if (config && config.s3 && config.s3.putObject) {
  const { CacheControl, ...rest } = config.s3.putObject;
  s3PutObjectCacheControl = CacheControl;
  s3PutObjectConfigSansCacheControl = { ...rest };
}

const cacheControl = getCacheControl(s3PutObjectCacheControl);

const s3 = new aws.S3({
  endpoint: config.s3Endpoint,
});

exports.readManifest = function (filePath) {
  return new Promise(function (resolve, reject) {
    let file = parseFilePath(filePath);
    s3.getObject(
      {
        Bucket: file.bucket,
        Key: file.key,
      },
      function (err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data.Body.toString());
        }
      }
    );
  });
};

exports.writeManifest = function (filePath, data) {
  const jsonPromise = new Promise(function (resolve, reject) {
    const file = parseFilePath(filePath);
    s3.putObject(
      {
        Bucket: file.bucket,
        Key: file.key,
        Body: data,
        CacheControl: cacheControl,
        ContentType: "application/importmap+json",
        ACL: "public-read",
        ...s3PutObjectConfigSansCacheControl,
      },
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  const jsPromise = new Promise(function (resolve, reject) {
    if (!config || !config.writeJsFile) {
      resolve();
    } else {
      const file = parseFilePath(filePath);
      const jsKey = jsHelpers.getJsPath(file.key);

      s3.putObject(
        {
          Bucket: file.bucket,
          Key: jsKey,
          Body: jsHelpers.createJsString(data),
          CacheControl: cacheControl,
          ContentType: "application/importmap+json",
          ACL: "public-read",
          ...s3PutObjectConfigSansCacheControl,
        },
        function (err) {
          if (err) reject(err);
          else resolve();
        }
      );
    }
  });
  return Promise.all([jsonPromise, jsPromise]);
};

function isDigitalOcean(filePath) {
  return filePath.startsWith("spaces://");
}
