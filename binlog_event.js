var util = require('util');

const UNKNOWN_EVENT = 0x00,
      START_EVENT_V3 = 0x01,
      QUERY_EVENT = 0x02,
      STOP_EVENT = 0x03,
      ROTATE_EVENT = 0x04,
      INTVAR_EVENT = 0x05,
      LOAD_EVENT = 0x06,
      SLAVE_EVENT = 0x07,
      CREATE_FILE_EVENT = 0x08,
      APPEND_BLOCK_EVENT = 0x09,
      EXEC_LOAD_EVENT = 0x0a,
      DELETE_FILE_EVENT = 0x0b,
      NEW_LOAD_EVENT = 0x0c,
      RAND_EVENT = 0x0d,
      USER_VAR_EVENT = 0x0e,
      FORMAT_DESCRIPTION_EVENT = 0x0f,
      XID_EVENT = 0x10,
      BEGIN_LOAD_QUERY_EVENT = 0x11,
      EXECUTE_LOAD_QUERY_EVENT = 0x12,
      TABLE_MAP_EVENT = 0x13,
      PRE_GA_DELETE_ROWS_EVENT = 0x14,
      PRE_GA_UPDATE_ROWS_EVENT = 0x15,
      PRE_GA_WRITE_ROWS_EVENT = 0x16,
      DELETE_ROWS_EVENT_V1 = 0x19,
      UPDATE_ROWS_EVENT_V1 = 0x18,
      WRITE_ROWS_EVENT_V1 = 0x17,
      INCIDENT_EVENT = 0x1a,
      HEARTBEAT_LOG_EVENT = 0x1b,
      IGNORABLE_LOG_EVENT = 0x1c,
      ROWS_QUERY_LOG_EVENT = 0x1d,
      WRITE_ROWS_EVENT_V2 = 0x1e,
      UPDATE_ROWS_EVENT_V2 = 0x1f,
      DELETE_ROWS_EVENT_V2 = 0x20,
      GTID_LOG_EVENT = 0x21,
      ANONYMOUS_GTID_LOG_EVENT = 0x22,
      PREVIOUS_GTIDS_LOG_EVENT = 0x23;

// from http://stackoverflow.com/questions/17687307/convert-a-64bit-little-endian-integer-to-number
function readUInt64(buff, offset) {
  return buff.readInt32LE(offset) + 0x100000000 * buff.readUInt32LE(offset + 4);
}

function BinlogEvent(buffer, typeCode, timestamp, nextPosition, size) {
  this.buffer = buffer;
  this.typeCode = typeCode;
  this.timestamp = timestamp;
  this.nextPosition = nextPosition;
  this.size = size;
}

BinlogEvent.prototype.getEventName = function() {
  return this.getTypeName().toLowerCase();
};

BinlogEvent.prototype.getTypeName = function() {
  return this.constructor.name;
};

BinlogEvent.prototype.getTypeCode = function() {
  return this.typeCode;
};

BinlogEvent.prototype.dump = function() {
  console.log("=== %s ===", this.getTypeName());
  console.log("Date: %s", new Date(this.timestamp));
  console.log("Next log position: %d", this.nextPosition);
  console.log("Event size: %d", (this.size));
  console.log("Buffer:", this.buffer);
};

// Change MySQL bin log file
// Attributes:
//     position: Position inside next binlog
//     binlogName: Name of next binlog file
function Rotate(buffer, typeCode, timestamp, nextPosition, size) {
  if (this instanceof Rotate) {
    BinlogEvent.apply(this, arguments);
    this.position = readUInt64(this.buffer, 0);
    this.binlogName = this.buffer.toString('ascii', 8);
  }
  else {
    return new Rotate(buffer, typeCode, timestamp, nextPosition, size);
  }
}
util.inherits(Rotate, BinlogEvent);

Rotate.prototype.dump = function() {
  console.log("=== %s ===", this.getTypeName());
  console.log("Event size: %d", (this.size));
  console.log("Position: %d", this.position);
  console.log("Next binlog file: %s", this.binlogName);
};

exports.Rotate = Rotate;

function Format(buffer, typeCode, timestamp, nextPosition, size) {
  if (this instanceof Format) {
    BinlogEvent.apply(this, arguments);
  }
  else {
    return new Format(buffer, typeCode, timestamp, nextPosition, size);
  }
}
util.inherits(Format, BinlogEvent);

exports.Format = Format;

// A COMMIT event
// Attributes:
//     xid: Transaction ID for 2PC
function Xid(buffer, typeCode, timestamp, nextPosition, size) {
  if (this instanceof Xid) {
    BinlogEvent.apply(this, arguments);
  }
  else {
    return new Xid(buffer, typeCode, timestamp, nextPosition, size);
  }
}
util.inherits(Xid, BinlogEvent);

// This evenement is trigger when a query is run of the database.
// Only replicated queries are logged.
function Query(buffer, typeCode, timestamp, nextPosition, size) {
  if (this instanceof Query) {
    BinlogEvent.apply(this, arguments);
  }
  else {
    return new Query(buffer, typeCode, timestamp, nextPosition, size);
  }
}
util.inherits(Query, BinlogEvent);

function Unknown(buffer, typeCode, timestamp, nextPosition, size) {
  if (this instanceof Unknown) {
    BinlogEvent.apply(this, arguments);
  }
  else {
    return new Unknown(buffer, typeCode, timestamp, nextPosition, size);
  }
}
util.inherits(Unknown, BinlogEvent);

function parseHeader(buffer) {
  // uint8_t  marker; // always 0 or 0xFF
  // uint32_t timestamp;
  // uint8_t  type_code;
  // uint32_t server_id;
  // uint32_t event_length;
  // uint32_t next_position;
  // uint16_t flags;
  var position = 0;

  buffer.readUInt8(position);
  position += 1;

  var timestamp = buffer.readUInt32LE(position);
  position += 4;

  var eventType = buffer.readUInt8(position);
  position += 1;

  var serverId = buffer.readUInt32LE(position);
  position += 4;

  var eventLength = buffer.readUInt32LE(position);
  position += 4;

  var nextPosition = buffer.readUInt32LE(position);
  position += 4;

  var flags = buffer.readUInt16LE(position);
  position += 2;

  // headerLength doesn't count marker
  var headerLength = position - 1;
  // for MySQL 5.6 and binlog-checksum = CRC32
  // if (useChecksum) {
  //   headerLength += 4;
  // }
  var eventSize = eventLength - headerLength;
  var binlogBuffer = buffer.slice(position);

  return [binlogBuffer, eventType, timestamp, nextPosition, eventSize];
}

exports.parseHeader = parseHeader;

var eventMap = [
  { code: ROTATE_EVENT, type: Rotate },
  { code: FORMAT_DESCRIPTION_EVENT, type: Format },
  { code: QUERY_EVENT, type: Query },
  { code: XID_EVENT, type: Xid },
];

function getEventTypeByCode(code) {
  var result = Unknown;
  for (var i = eventMap.length - 1; i >= 0; i--) {
    if (eventMap[i].code == code) {
      result = eventMap[i].type;
      break;
    }
  }
  return result;
}

exports.create = function(buffer) {
  var params = parseHeader(buffer);
  var claz = getEventTypeByCode(params[1]);
  var binlogEvent = claz.apply(null, params);

  return binlogEvent;
};
