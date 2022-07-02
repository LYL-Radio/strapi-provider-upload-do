'use strict';

/**
 * Module dependencies
 */

// Public node modules.
const AWS = require('aws-sdk');
const URI = require('urijs');
const crypto = require('crypto');

class FileLocationConverter {
  constructor(config) {
    this.config = config;
  }

  getKey(file) {
    const filename = `${file.hash}${file.ext}`;
    if (!this.config.directory) return filename;
    return `${this.config.directory}/${filename}`;
  }

  getUrl(data) {
    if (!this.config.cdn) return data.Location;
    var parts = {};
    URI.parseHost(this.config.cdn, parts);
    parts.protocol = "https"; // Force https
    parts.path = data.Key;
    return URI.build(parts);
  }
}

module.exports = {
  init(config) {
    const endpoint = new AWS.Endpoint(config.endpoint);
    const converter = new FileLocationConverter(config);

    const S3 = new AWS.S3({
      endpoint: endpoint,
      accessKeyId: config.key,
      secretAccessKey: config.secret,
      params: {
        ACL: 'public-read',
        Bucket: config.space,
        CacheControl: 'public, max-age=31536000, immutable'
      },
    });

    const upload = (file, customParams = {}) =>
      new Promise((resolve, reject) => {
        //--- Compute the file key.
        file.hash = crypto.createHash('md5').update(file.hash).digest("hex");

        //--- Upload the file into the space (technically the S3 Bucket)
        S3.upload({
          Key: converter.getKey(file),
          Body: file.stream || Buffer.from(file.buffer, "binary"),
          ContentType: file.mime,
          ...customParams,
        },

        //--- Callback handler
        (err, data) => {
          if (err) return reject(err);
          file.url = converter.getUrl(data);
          resolve();
        });
      });

    return {
      uploadStream(file, customParams = {}) {
        return upload(file, customParams);
      },
      upload(file, customParams = {}) {
        return upload(file, customParams);
      },
      delete(file, customParams = {}) {
        return new Promise((resolve, reject) => {
          //--- Delete the file from the space
          S3.deleteObject({
            Bucket: config.bucket,
            Key: converter.getKey(file),
            ...customParams,
          },

          //--- Callback handler
          (err, data) => {
            if (err) return reject(err);
            else resolve();
          })
        });
      },
    };
  },
};
