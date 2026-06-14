const crypto = require('crypto');

function makeId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

module.exports = { makeId };
