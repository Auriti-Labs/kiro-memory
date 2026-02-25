import { createRequire } from 'module';const require = createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ip-address/dist/common.js
var require_common = __commonJS({
  "node_modules/ip-address/dist/common.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isInSubnet = isInSubnet;
    exports.isCorrect = isCorrect;
    exports.numberToPaddedHex = numberToPaddedHex;
    exports.stringToPaddedHex = stringToPaddedHex;
    exports.testBit = testBit;
    function isInSubnet(address) {
      if (this.subnetMask < address.subnetMask) {
        return false;
      }
      if (this.mask(address.subnetMask) === address.mask()) {
        return true;
      }
      return false;
    }
    function isCorrect(defaultBits) {
      return function() {
        if (this.addressMinusSuffix !== this.correctForm()) {
          return false;
        }
        if (this.subnetMask === defaultBits && !this.parsedSubnet) {
          return true;
        }
        return this.parsedSubnet === String(this.subnetMask);
      };
    }
    function numberToPaddedHex(number) {
      return number.toString(16).padStart(2, "0");
    }
    function stringToPaddedHex(numberString) {
      return numberToPaddedHex(parseInt(numberString, 10));
    }
    function testBit(binaryValue, position) {
      const { length } = binaryValue;
      if (position > length) {
        return false;
      }
      const positionInString = length - position;
      return binaryValue.substring(positionInString, positionInString + 1) === "1";
    }
  }
});

// node_modules/ip-address/dist/v4/constants.js
var require_constants = __commonJS({
  "node_modules/ip-address/dist/v4/constants.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.RE_SUBNET_STRING = exports.RE_ADDRESS = exports.GROUPS = exports.BITS = void 0;
    exports.BITS = 32;
    exports.GROUPS = 4;
    exports.RE_ADDRESS = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/g;
    exports.RE_SUBNET_STRING = /\/\d{1,2}$/;
  }
});

// node_modules/ip-address/dist/address-error.js
var require_address_error = __commonJS({
  "node_modules/ip-address/dist/address-error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AddressError = void 0;
    var AddressError = class extends Error {
      constructor(message, parseMessage) {
        super(message);
        this.name = "AddressError";
        this.parseMessage = parseMessage;
      }
    };
    exports.AddressError = AddressError;
  }
});

// node_modules/ip-address/dist/ipv4.js
var require_ipv4 = __commonJS({
  "node_modules/ip-address/dist/ipv4.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Address4 = void 0;
    var common = __importStar(require_common());
    var constants = __importStar(require_constants());
    var address_error_1 = require_address_error();
    var Address4 = class _Address4 {
      constructor(address) {
        this.groups = constants.GROUPS;
        this.parsedAddress = [];
        this.parsedSubnet = "";
        this.subnet = "/32";
        this.subnetMask = 32;
        this.v4 = true;
        this.isCorrect = common.isCorrect(constants.BITS);
        this.isInSubnet = common.isInSubnet;
        this.address = address;
        const subnet = constants.RE_SUBNET_STRING.exec(address);
        if (subnet) {
          this.parsedSubnet = subnet[0].replace("/", "");
          this.subnetMask = parseInt(this.parsedSubnet, 10);
          this.subnet = `/${this.subnetMask}`;
          if (this.subnetMask < 0 || this.subnetMask > constants.BITS) {
            throw new address_error_1.AddressError("Invalid subnet mask.");
          }
          address = address.replace(constants.RE_SUBNET_STRING, "");
        }
        this.addressMinusSuffix = address;
        this.parsedAddress = this.parse(address);
      }
      static isValid(address) {
        try {
          new _Address4(address);
          return true;
        } catch (e) {
          return false;
        }
      }
      /*
       * Parses a v4 address
       */
      parse(address) {
        const groups = address.split(".");
        if (!address.match(constants.RE_ADDRESS)) {
          throw new address_error_1.AddressError("Invalid IPv4 address.");
        }
        return groups;
      }
      /**
       * Returns the correct form of an address
       * @memberof Address4
       * @instance
       * @returns {String}
       */
      correctForm() {
        return this.parsedAddress.map((part) => parseInt(part, 10)).join(".");
      }
      /**
       * Converts a hex string to an IPv4 address object
       * @memberof Address4
       * @static
       * @param {string} hex - a hex string to convert
       * @returns {Address4}
       */
      static fromHex(hex) {
        const padded = hex.replace(/:/g, "").padStart(8, "0");
        const groups = [];
        let i;
        for (i = 0; i < 8; i += 2) {
          const h = padded.slice(i, i + 2);
          groups.push(parseInt(h, 16));
        }
        return new _Address4(groups.join("."));
      }
      /**
       * Converts an integer into a IPv4 address object
       * @memberof Address4
       * @static
       * @param {integer} integer - a number to convert
       * @returns {Address4}
       */
      static fromInteger(integer) {
        return _Address4.fromHex(integer.toString(16));
      }
      /**
       * Return an address from in-addr.arpa form
       * @memberof Address4
       * @static
       * @param {string} arpaFormAddress - an 'in-addr.arpa' form ipv4 address
       * @returns {Adress4}
       * @example
       * var address = Address4.fromArpa(42.2.0.192.in-addr.arpa.)
       * address.correctForm(); // '192.0.2.42'
       */
      static fromArpa(arpaFormAddress) {
        const leader = arpaFormAddress.replace(/(\.in-addr\.arpa)?\.$/, "");
        const address = leader.split(".").reverse().join(".");
        return new _Address4(address);
      }
      /**
       * Converts an IPv4 address object to a hex string
       * @memberof Address4
       * @instance
       * @returns {String}
       */
      toHex() {
        return this.parsedAddress.map((part) => common.stringToPaddedHex(part)).join(":");
      }
      /**
       * Converts an IPv4 address object to an array of bytes
       * @memberof Address4
       * @instance
       * @returns {Array}
       */
      toArray() {
        return this.parsedAddress.map((part) => parseInt(part, 10));
      }
      /**
       * Converts an IPv4 address object to an IPv6 address group
       * @memberof Address4
       * @instance
       * @returns {String}
       */
      toGroup6() {
        const output = [];
        let i;
        for (i = 0; i < constants.GROUPS; i += 2) {
          output.push(`${common.stringToPaddedHex(this.parsedAddress[i])}${common.stringToPaddedHex(this.parsedAddress[i + 1])}`);
        }
        return output.join(":");
      }
      /**
       * Returns the address as a `bigint`
       * @memberof Address4
       * @instance
       * @returns {bigint}
       */
      bigInt() {
        return BigInt(`0x${this.parsedAddress.map((n) => common.stringToPaddedHex(n)).join("")}`);
      }
      /**
       * Helper function getting start address.
       * @memberof Address4
       * @instance
       * @returns {bigint}
       */
      _startAddress() {
        return BigInt(`0b${this.mask() + "0".repeat(constants.BITS - this.subnetMask)}`);
      }
      /**
       * The first address in the range given by this address' subnet.
       * Often referred to as the Network Address.
       * @memberof Address4
       * @instance
       * @returns {Address4}
       */
      startAddress() {
        return _Address4.fromBigInt(this._startAddress());
      }
      /**
       * The first host address in the range given by this address's subnet ie
       * the first address after the Network Address
       * @memberof Address4
       * @instance
       * @returns {Address4}
       */
      startAddressExclusive() {
        const adjust = BigInt("1");
        return _Address4.fromBigInt(this._startAddress() + adjust);
      }
      /**
       * Helper function getting end address.
       * @memberof Address4
       * @instance
       * @returns {bigint}
       */
      _endAddress() {
        return BigInt(`0b${this.mask() + "1".repeat(constants.BITS - this.subnetMask)}`);
      }
      /**
       * The last address in the range given by this address' subnet
       * Often referred to as the Broadcast
       * @memberof Address4
       * @instance
       * @returns {Address4}
       */
      endAddress() {
        return _Address4.fromBigInt(this._endAddress());
      }
      /**
       * The last host address in the range given by this address's subnet ie
       * the last address prior to the Broadcast Address
       * @memberof Address4
       * @instance
       * @returns {Address4}
       */
      endAddressExclusive() {
        const adjust = BigInt("1");
        return _Address4.fromBigInt(this._endAddress() - adjust);
      }
      /**
       * Converts a BigInt to a v4 address object
       * @memberof Address4
       * @static
       * @param {bigint} bigInt - a BigInt to convert
       * @returns {Address4}
       */
      static fromBigInt(bigInt) {
        return _Address4.fromHex(bigInt.toString(16));
      }
      /**
       * Returns the first n bits of the address, defaulting to the
       * subnet mask
       * @memberof Address4
       * @instance
       * @returns {String}
       */
      mask(mask) {
        if (mask === void 0) {
          mask = this.subnetMask;
        }
        return this.getBitsBase2(0, mask);
      }
      /**
       * Returns the bits in the given range as a base-2 string
       * @memberof Address4
       * @instance
       * @returns {string}
       */
      getBitsBase2(start, end) {
        return this.binaryZeroPad().slice(start, end);
      }
      /**
       * Return the reversed ip6.arpa form of the address
       * @memberof Address4
       * @param {Object} options
       * @param {boolean} options.omitSuffix - omit the "in-addr.arpa" suffix
       * @instance
       * @returns {String}
       */
      reverseForm(options) {
        if (!options) {
          options = {};
        }
        const reversed = this.correctForm().split(".").reverse().join(".");
        if (options.omitSuffix) {
          return reversed;
        }
        return `${reversed}.in-addr.arpa.`;
      }
      /**
       * Returns true if the given address is a multicast address
       * @memberof Address4
       * @instance
       * @returns {boolean}
       */
      isMulticast() {
        return this.isInSubnet(new _Address4("224.0.0.0/4"));
      }
      /**
       * Returns a zero-padded base-2 string representation of the address
       * @memberof Address4
       * @instance
       * @returns {string}
       */
      binaryZeroPad() {
        return this.bigInt().toString(2).padStart(constants.BITS, "0");
      }
      /**
       * Groups an IPv4 address for inclusion at the end of an IPv6 address
       * @returns {String}
       */
      groupForV6() {
        const segments = this.parsedAddress;
        return this.address.replace(constants.RE_ADDRESS, `<span class="hover-group group-v4 group-6">${segments.slice(0, 2).join(".")}</span>.<span class="hover-group group-v4 group-7">${segments.slice(2, 4).join(".")}</span>`);
      }
    };
    exports.Address4 = Address4;
  }
});

// node_modules/ip-address/dist/v6/constants.js
var require_constants2 = __commonJS({
  "node_modules/ip-address/dist/v6/constants.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.RE_URL_WITH_PORT = exports.RE_URL = exports.RE_ZONE_STRING = exports.RE_SUBNET_STRING = exports.RE_BAD_ADDRESS = exports.RE_BAD_CHARACTERS = exports.TYPES = exports.SCOPES = exports.GROUPS = exports.BITS = void 0;
    exports.BITS = 128;
    exports.GROUPS = 8;
    exports.SCOPES = {
      0: "Reserved",
      1: "Interface local",
      2: "Link local",
      4: "Admin local",
      5: "Site local",
      8: "Organization local",
      14: "Global",
      15: "Reserved"
    };
    exports.TYPES = {
      "ff01::1/128": "Multicast (All nodes on this interface)",
      "ff01::2/128": "Multicast (All routers on this interface)",
      "ff02::1/128": "Multicast (All nodes on this link)",
      "ff02::2/128": "Multicast (All routers on this link)",
      "ff05::2/128": "Multicast (All routers in this site)",
      "ff02::5/128": "Multicast (OSPFv3 AllSPF routers)",
      "ff02::6/128": "Multicast (OSPFv3 AllDR routers)",
      "ff02::9/128": "Multicast (RIP routers)",
      "ff02::a/128": "Multicast (EIGRP routers)",
      "ff02::d/128": "Multicast (PIM routers)",
      "ff02::16/128": "Multicast (MLDv2 reports)",
      "ff01::fb/128": "Multicast (mDNSv6)",
      "ff02::fb/128": "Multicast (mDNSv6)",
      "ff05::fb/128": "Multicast (mDNSv6)",
      "ff02::1:2/128": "Multicast (All DHCP servers and relay agents on this link)",
      "ff05::1:2/128": "Multicast (All DHCP servers and relay agents in this site)",
      "ff02::1:3/128": "Multicast (All DHCP servers on this link)",
      "ff05::1:3/128": "Multicast (All DHCP servers in this site)",
      "::/128": "Unspecified",
      "::1/128": "Loopback",
      "ff00::/8": "Multicast",
      "fe80::/10": "Link-local unicast"
    };
    exports.RE_BAD_CHARACTERS = /([^0-9a-f:/%])/gi;
    exports.RE_BAD_ADDRESS = /([0-9a-f]{5,}|:{3,}|[^:]:$|^:[^:]|\/$)/gi;
    exports.RE_SUBNET_STRING = /\/\d{1,3}(?=%|$)/;
    exports.RE_ZONE_STRING = /%.*$/;
    exports.RE_URL = /^\[{0,1}([0-9a-f:]+)\]{0,1}/;
    exports.RE_URL_WITH_PORT = /\[([0-9a-f:]+)\]:([0-9]{1,5})/;
  }
});

// node_modules/ip-address/dist/v6/helpers.js
var require_helpers = __commonJS({
  "node_modules/ip-address/dist/v6/helpers.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.spanAllZeroes = spanAllZeroes;
    exports.spanAll = spanAll;
    exports.spanLeadingZeroes = spanLeadingZeroes;
    exports.simpleGroup = simpleGroup;
    function spanAllZeroes(s) {
      return s.replace(/(0+)/g, '<span class="zero">$1</span>');
    }
    function spanAll(s, offset = 0) {
      const letters = s.split("");
      return letters.map((n, i) => `<span class="digit value-${n} position-${i + offset}">${spanAllZeroes(n)}</span>`).join("");
    }
    function spanLeadingZeroesSimple(group) {
      return group.replace(/^(0+)/, '<span class="zero">$1</span>');
    }
    function spanLeadingZeroes(address) {
      const groups = address.split(":");
      return groups.map((g) => spanLeadingZeroesSimple(g)).join(":");
    }
    function simpleGroup(addressString, offset = 0) {
      const groups = addressString.split(":");
      return groups.map((g, i) => {
        if (/group-v4/.test(g)) {
          return g;
        }
        return `<span class="hover-group group-${i + offset}">${spanLeadingZeroesSimple(g)}</span>`;
      });
    }
  }
});

// node_modules/ip-address/dist/v6/regular-expressions.js
var require_regular_expressions = __commonJS({
  "node_modules/ip-address/dist/v6/regular-expressions.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ADDRESS_BOUNDARY = void 0;
    exports.groupPossibilities = groupPossibilities;
    exports.padGroup = padGroup;
    exports.simpleRegularExpression = simpleRegularExpression;
    exports.possibleElisions = possibleElisions;
    var v6 = __importStar(require_constants2());
    function groupPossibilities(possibilities) {
      return `(${possibilities.join("|")})`;
    }
    function padGroup(group) {
      if (group.length < 4) {
        return `0{0,${4 - group.length}}${group}`;
      }
      return group;
    }
    exports.ADDRESS_BOUNDARY = "[^A-Fa-f0-9:]";
    function simpleRegularExpression(groups) {
      const zeroIndexes = [];
      groups.forEach((group, i) => {
        const groupInteger = parseInt(group, 16);
        if (groupInteger === 0) {
          zeroIndexes.push(i);
        }
      });
      const possibilities = zeroIndexes.map((zeroIndex) => groups.map((group, i) => {
        if (i === zeroIndex) {
          const elision = i === 0 || i === v6.GROUPS - 1 ? ":" : "";
          return groupPossibilities([padGroup(group), elision]);
        }
        return padGroup(group);
      }).join(":"));
      possibilities.push(groups.map(padGroup).join(":"));
      return groupPossibilities(possibilities);
    }
    function possibleElisions(elidedGroups, moreLeft, moreRight) {
      const left = moreLeft ? "" : ":";
      const right = moreRight ? "" : ":";
      const possibilities = [];
      if (!moreLeft && !moreRight) {
        possibilities.push("::");
      }
      if (moreLeft && moreRight) {
        possibilities.push("");
      }
      if (moreRight && !moreLeft || !moreRight && moreLeft) {
        possibilities.push(":");
      }
      possibilities.push(`${left}(:0{1,4}){1,${elidedGroups - 1}}`);
      possibilities.push(`(0{1,4}:){1,${elidedGroups - 1}}${right}`);
      possibilities.push(`(0{1,4}:){${elidedGroups - 1}}0{1,4}`);
      for (let groups = 1; groups < elidedGroups - 1; groups++) {
        for (let position = 1; position < elidedGroups - groups; position++) {
          possibilities.push(`(0{1,4}:){${position}}:(0{1,4}:){${elidedGroups - position - groups - 1}}0{1,4}`);
        }
      }
      return groupPossibilities(possibilities);
    }
  }
});

// node_modules/ip-address/dist/ipv6.js
var require_ipv6 = __commonJS({
  "node_modules/ip-address/dist/ipv6.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Address6 = void 0;
    var common = __importStar(require_common());
    var constants4 = __importStar(require_constants());
    var constants6 = __importStar(require_constants2());
    var helpers = __importStar(require_helpers());
    var ipv4_1 = require_ipv4();
    var regular_expressions_1 = require_regular_expressions();
    var address_error_1 = require_address_error();
    var common_1 = require_common();
    function assert(condition) {
      if (!condition) {
        throw new Error("Assertion failed.");
      }
    }
    function addCommas(number) {
      const r = /(\d+)(\d{3})/;
      while (r.test(number)) {
        number = number.replace(r, "$1,$2");
      }
      return number;
    }
    function spanLeadingZeroes4(n) {
      n = n.replace(/^(0{1,})([1-9]+)$/, '<span class="parse-error">$1</span>$2');
      n = n.replace(/^(0{1,})(0)$/, '<span class="parse-error">$1</span>$2');
      return n;
    }
    function compact(address, slice) {
      const s1 = [];
      const s2 = [];
      let i;
      for (i = 0; i < address.length; i++) {
        if (i < slice[0]) {
          s1.push(address[i]);
        } else if (i > slice[1]) {
          s2.push(address[i]);
        }
      }
      return s1.concat(["compact"]).concat(s2);
    }
    function paddedHex(octet) {
      return parseInt(octet, 16).toString(16).padStart(4, "0");
    }
    function unsignByte(b) {
      return b & 255;
    }
    var Address62 = class _Address6 {
      constructor(address, optionalGroups) {
        this.addressMinusSuffix = "";
        this.parsedSubnet = "";
        this.subnet = "/128";
        this.subnetMask = 128;
        this.v4 = false;
        this.zone = "";
        this.isInSubnet = common.isInSubnet;
        this.isCorrect = common.isCorrect(constants6.BITS);
        if (optionalGroups === void 0) {
          this.groups = constants6.GROUPS;
        } else {
          this.groups = optionalGroups;
        }
        this.address = address;
        const subnet = constants6.RE_SUBNET_STRING.exec(address);
        if (subnet) {
          this.parsedSubnet = subnet[0].replace("/", "");
          this.subnetMask = parseInt(this.parsedSubnet, 10);
          this.subnet = `/${this.subnetMask}`;
          if (Number.isNaN(this.subnetMask) || this.subnetMask < 0 || this.subnetMask > constants6.BITS) {
            throw new address_error_1.AddressError("Invalid subnet mask.");
          }
          address = address.replace(constants6.RE_SUBNET_STRING, "");
        } else if (/\//.test(address)) {
          throw new address_error_1.AddressError("Invalid subnet mask.");
        }
        const zone = constants6.RE_ZONE_STRING.exec(address);
        if (zone) {
          this.zone = zone[0];
          address = address.replace(constants6.RE_ZONE_STRING, "");
        }
        this.addressMinusSuffix = address;
        this.parsedAddress = this.parse(this.addressMinusSuffix);
      }
      static isValid(address) {
        try {
          new _Address6(address);
          return true;
        } catch (e) {
          return false;
        }
      }
      /**
       * Convert a BigInt to a v6 address object
       * @memberof Address6
       * @static
       * @param {bigint} bigInt - a BigInt to convert
       * @returns {Address6}
       * @example
       * var bigInt = BigInt('1000000000000');
       * var address = Address6.fromBigInt(bigInt);
       * address.correctForm(); // '::e8:d4a5:1000'
       */
      static fromBigInt(bigInt) {
        const hex = bigInt.toString(16).padStart(32, "0");
        const groups = [];
        let i;
        for (i = 0; i < constants6.GROUPS; i++) {
          groups.push(hex.slice(i * 4, (i + 1) * 4));
        }
        return new _Address6(groups.join(":"));
      }
      /**
       * Convert a URL (with optional port number) to an address object
       * @memberof Address6
       * @static
       * @param {string} url - a URL with optional port number
       * @example
       * var addressAndPort = Address6.fromURL('http://[ffff::]:8080/foo/');
       * addressAndPort.address.correctForm(); // 'ffff::'
       * addressAndPort.port; // 8080
       */
      static fromURL(url) {
        let host;
        let port = null;
        let result;
        if (url.indexOf("[") !== -1 && url.indexOf("]:") !== -1) {
          result = constants6.RE_URL_WITH_PORT.exec(url);
          if (result === null) {
            return {
              error: "failed to parse address with port",
              address: null,
              port: null
            };
          }
          host = result[1];
          port = result[2];
        } else if (url.indexOf("/") !== -1) {
          url = url.replace(/^[a-z0-9]+:\/\//, "");
          result = constants6.RE_URL.exec(url);
          if (result === null) {
            return {
              error: "failed to parse address from URL",
              address: null,
              port: null
            };
          }
          host = result[1];
        } else {
          host = url;
        }
        if (port) {
          port = parseInt(port, 10);
          if (port < 0 || port > 65536) {
            port = null;
          }
        } else {
          port = null;
        }
        return {
          address: new _Address6(host),
          port
        };
      }
      /**
       * Create an IPv6-mapped address given an IPv4 address
       * @memberof Address6
       * @static
       * @param {string} address - An IPv4 address string
       * @returns {Address6}
       * @example
       * var address = Address6.fromAddress4('192.168.0.1');
       * address.correctForm(); // '::ffff:c0a8:1'
       * address.to4in6(); // '::ffff:192.168.0.1'
       */
      static fromAddress4(address) {
        const address4 = new ipv4_1.Address4(address);
        const mask6 = constants6.BITS - (constants4.BITS - address4.subnetMask);
        return new _Address6(`::ffff:${address4.correctForm()}/${mask6}`);
      }
      /**
       * Return an address from ip6.arpa form
       * @memberof Address6
       * @static
       * @param {string} arpaFormAddress - an 'ip6.arpa' form address
       * @returns {Adress6}
       * @example
       * var address = Address6.fromArpa(e.f.f.f.3.c.2.6.f.f.f.e.6.6.8.e.1.0.6.7.9.4.e.c.0.0.0.0.1.0.0.2.ip6.arpa.)
       * address.correctForm(); // '2001:0:ce49:7601:e866:efff:62c3:fffe'
       */
      static fromArpa(arpaFormAddress) {
        let address = arpaFormAddress.replace(/(\.ip6\.arpa)?\.$/, "");
        const semicolonAmount = 7;
        if (address.length !== 63) {
          throw new address_error_1.AddressError("Invalid 'ip6.arpa' form.");
        }
        const parts = address.split(".").reverse();
        for (let i = semicolonAmount; i > 0; i--) {
          const insertIndex = i * 4;
          parts.splice(insertIndex, 0, ":");
        }
        address = parts.join("");
        return new _Address6(address);
      }
      /**
       * Return the Microsoft UNC transcription of the address
       * @memberof Address6
       * @instance
       * @returns {String} the Microsoft UNC transcription of the address
       */
      microsoftTranscription() {
        return `${this.correctForm().replace(/:/g, "-")}.ipv6-literal.net`;
      }
      /**
       * Return the first n bits of the address, defaulting to the subnet mask
       * @memberof Address6
       * @instance
       * @param {number} [mask=subnet] - the number of bits to mask
       * @returns {String} the first n bits of the address as a string
       */
      mask(mask = this.subnetMask) {
        return this.getBitsBase2(0, mask);
      }
      /**
       * Return the number of possible subnets of a given size in the address
       * @memberof Address6
       * @instance
       * @param {number} [subnetSize=128] - the subnet size
       * @returns {String}
       */
      // TODO: probably useful to have a numeric version of this too
      possibleSubnets(subnetSize = 128) {
        const availableBits = constants6.BITS - this.subnetMask;
        const subnetBits = Math.abs(subnetSize - constants6.BITS);
        const subnetPowers = availableBits - subnetBits;
        if (subnetPowers < 0) {
          return "0";
        }
        return addCommas((BigInt("2") ** BigInt(subnetPowers)).toString(10));
      }
      /**
       * Helper function getting start address.
       * @memberof Address6
       * @instance
       * @returns {bigint}
       */
      _startAddress() {
        return BigInt(`0b${this.mask() + "0".repeat(constants6.BITS - this.subnetMask)}`);
      }
      /**
       * The first address in the range given by this address' subnet
       * Often referred to as the Network Address.
       * @memberof Address6
       * @instance
       * @returns {Address6}
       */
      startAddress() {
        return _Address6.fromBigInt(this._startAddress());
      }
      /**
       * The first host address in the range given by this address's subnet ie
       * the first address after the Network Address
       * @memberof Address6
       * @instance
       * @returns {Address6}
       */
      startAddressExclusive() {
        const adjust = BigInt("1");
        return _Address6.fromBigInt(this._startAddress() + adjust);
      }
      /**
       * Helper function getting end address.
       * @memberof Address6
       * @instance
       * @returns {bigint}
       */
      _endAddress() {
        return BigInt(`0b${this.mask() + "1".repeat(constants6.BITS - this.subnetMask)}`);
      }
      /**
       * The last address in the range given by this address' subnet
       * Often referred to as the Broadcast
       * @memberof Address6
       * @instance
       * @returns {Address6}
       */
      endAddress() {
        return _Address6.fromBigInt(this._endAddress());
      }
      /**
       * The last host address in the range given by this address's subnet ie
       * the last address prior to the Broadcast Address
       * @memberof Address6
       * @instance
       * @returns {Address6}
       */
      endAddressExclusive() {
        const adjust = BigInt("1");
        return _Address6.fromBigInt(this._endAddress() - adjust);
      }
      /**
       * Return the scope of the address
       * @memberof Address6
       * @instance
       * @returns {String}
       */
      getScope() {
        let scope = constants6.SCOPES[parseInt(this.getBits(12, 16).toString(10), 10)];
        if (this.getType() === "Global unicast" && scope !== "Link local") {
          scope = "Global";
        }
        return scope || "Unknown";
      }
      /**
       * Return the type of the address
       * @memberof Address6
       * @instance
       * @returns {String}
       */
      getType() {
        for (const subnet of Object.keys(constants6.TYPES)) {
          if (this.isInSubnet(new _Address6(subnet))) {
            return constants6.TYPES[subnet];
          }
        }
        return "Global unicast";
      }
      /**
       * Return the bits in the given range as a BigInt
       * @memberof Address6
       * @instance
       * @returns {bigint}
       */
      getBits(start, end) {
        return BigInt(`0b${this.getBitsBase2(start, end)}`);
      }
      /**
       * Return the bits in the given range as a base-2 string
       * @memberof Address6
       * @instance
       * @returns {String}
       */
      getBitsBase2(start, end) {
        return this.binaryZeroPad().slice(start, end);
      }
      /**
       * Return the bits in the given range as a base-16 string
       * @memberof Address6
       * @instance
       * @returns {String}
       */
      getBitsBase16(start, end) {
        const length = end - start;
        if (length % 4 !== 0) {
          throw new Error("Length of bits to retrieve must be divisible by four");
        }
        return this.getBits(start, end).toString(16).padStart(length / 4, "0");
      }
      /**
       * Return the bits that are set past the subnet mask length
       * @memberof Address6
       * @instance
       * @returns {String}
       */
      getBitsPastSubnet() {
        return this.getBitsBase2(this.subnetMask, constants6.BITS);
      }
      /**
       * Return the reversed ip6.arpa form of the address
       * @memberof Address6
       * @param {Object} options
       * @param {boolean} options.omitSuffix - omit the "ip6.arpa" suffix
       * @instance
       * @returns {String}
       */
      reverseForm(options) {
        if (!options) {
          options = {};
        }
        const characters = Math.floor(this.subnetMask / 4);
        const reversed = this.canonicalForm().replace(/:/g, "").split("").slice(0, characters).reverse().join(".");
        if (characters > 0) {
          if (options.omitSuffix) {
            return reversed;
          }
          return `${reversed}.ip6.arpa.`;
        }
        if (options.omitSuffix) {
          return "";
        }
        return "ip6.arpa.";
      }
      /**
       * Return the correct form of the address
       * @memberof Address6
       * @instance
       * @returns {String}
       */
      correctForm() {
        let i;
        let groups = [];
        let zeroCounter = 0;
        const zeroes = [];
        for (i = 0; i < this.parsedAddress.length; i++) {
          const value = parseInt(this.parsedAddress[i], 16);
          if (value === 0) {
            zeroCounter++;
          }
          if (value !== 0 && zeroCounter > 0) {
            if (zeroCounter > 1) {
              zeroes.push([i - zeroCounter, i - 1]);
            }
            zeroCounter = 0;
          }
        }
        if (zeroCounter > 1) {
          zeroes.push([this.parsedAddress.length - zeroCounter, this.parsedAddress.length - 1]);
        }
        const zeroLengths = zeroes.map((n) => n[1] - n[0] + 1);
        if (zeroes.length > 0) {
          const index = zeroLengths.indexOf(Math.max(...zeroLengths));
          groups = compact(this.parsedAddress, zeroes[index]);
        } else {
          groups = this.parsedAddress;
        }
        for (i = 0; i < groups.length; i++) {
          if (groups[i] !== "compact") {
            groups[i] = parseInt(groups[i], 16).toString(16);
          }
        }
        let correct = groups.join(":");
        correct = correct.replace(/^compact$/, "::");
        correct = correct.replace(/(^compact)|(compact$)/, ":");
        correct = correct.replace(/compact/, "");
        return correct;
      }
      /**
       * Return a zero-padded base-2 string representation of the address
       * @memberof Address6
       * @instance
       * @returns {String}
       * @example
       * var address = new Address6('2001:4860:4001:803::1011');
       * address.binaryZeroPad();
       * // '0010000000000001010010000110000001000000000000010000100000000011
       * //  0000000000000000000000000000000000000000000000000001000000010001'
       */
      binaryZeroPad() {
        return this.bigInt().toString(2).padStart(constants6.BITS, "0");
      }
      // TODO: Improve the semantics of this helper function
      parse4in6(address) {
        const groups = address.split(":");
        const lastGroup = groups.slice(-1)[0];
        const address4 = lastGroup.match(constants4.RE_ADDRESS);
        if (address4) {
          this.parsedAddress4 = address4[0];
          this.address4 = new ipv4_1.Address4(this.parsedAddress4);
          for (let i = 0; i < this.address4.groups; i++) {
            if (/^0[0-9]+/.test(this.address4.parsedAddress[i])) {
              throw new address_error_1.AddressError("IPv4 addresses can't have leading zeroes.", address.replace(constants4.RE_ADDRESS, this.address4.parsedAddress.map(spanLeadingZeroes4).join(".")));
            }
          }
          this.v4 = true;
          groups[groups.length - 1] = this.address4.toGroup6();
          address = groups.join(":");
        }
        return address;
      }
      // TODO: Make private?
      parse(address) {
        address = this.parse4in6(address);
        const badCharacters = address.match(constants6.RE_BAD_CHARACTERS);
        if (badCharacters) {
          throw new address_error_1.AddressError(`Bad character${badCharacters.length > 1 ? "s" : ""} detected in address: ${badCharacters.join("")}`, address.replace(constants6.RE_BAD_CHARACTERS, '<span class="parse-error">$1</span>'));
        }
        const badAddress = address.match(constants6.RE_BAD_ADDRESS);
        if (badAddress) {
          throw new address_error_1.AddressError(`Address failed regex: ${badAddress.join("")}`, address.replace(constants6.RE_BAD_ADDRESS, '<span class="parse-error">$1</span>'));
        }
        let groups = [];
        const halves = address.split("::");
        if (halves.length === 2) {
          let first = halves[0].split(":");
          let last = halves[1].split(":");
          if (first.length === 1 && first[0] === "") {
            first = [];
          }
          if (last.length === 1 && last[0] === "") {
            last = [];
          }
          const remaining = this.groups - (first.length + last.length);
          if (!remaining) {
            throw new address_error_1.AddressError("Error parsing groups");
          }
          this.elidedGroups = remaining;
          this.elisionBegin = first.length;
          this.elisionEnd = first.length + this.elidedGroups;
          groups = groups.concat(first);
          for (let i = 0; i < remaining; i++) {
            groups.push("0");
          }
          groups = groups.concat(last);
        } else if (halves.length === 1) {
          groups = address.split(":");
          this.elidedGroups = 0;
        } else {
          throw new address_error_1.AddressError("Too many :: groups found");
        }
        groups = groups.map((group) => parseInt(group, 16).toString(16));
        if (groups.length !== this.groups) {
          throw new address_error_1.AddressError("Incorrect number of groups found");
        }
        return groups;
      }
      /**
       * Return the canonical form of the address
       * @memberof Address6
       * @instance
       * @returns {String}
       */
      canonicalForm() {
        return this.parsedAddress.map(paddedHex).join(":");
      }
      /**
       * Return the decimal form of the address
       * @memberof Address6
       * @instance
       * @returns {String}
       */
      decimal() {
        return this.parsedAddress.map((n) => parseInt(n, 16).toString(10).padStart(5, "0")).join(":");
      }
      /**
       * Return the address as a BigInt
       * @memberof Address6
       * @instance
       * @returns {bigint}
       */
      bigInt() {
        return BigInt(`0x${this.parsedAddress.map(paddedHex).join("")}`);
      }
      /**
       * Return the last two groups of this address as an IPv4 address string
       * @memberof Address6
       * @instance
       * @returns {Address4}
       * @example
       * var address = new Address6('2001:4860:4001::1825:bf11');
       * address.to4().correctForm(); // '24.37.191.17'
       */
      to4() {
        const binary = this.binaryZeroPad().split("");
        return ipv4_1.Address4.fromHex(BigInt(`0b${binary.slice(96, 128).join("")}`).toString(16));
      }
      /**
       * Return the v4-in-v6 form of the address
       * @memberof Address6
       * @instance
       * @returns {String}
       */
      to4in6() {
        const address4 = this.to4();
        const address6 = new _Address6(this.parsedAddress.slice(0, 6).join(":"), 6);
        const correct = address6.correctForm();
        let infix = "";
        if (!/:$/.test(correct)) {
          infix = ":";
        }
        return correct + infix + address4.address;
      }
      /**
       * Return an object containing the Teredo properties of the address
       * @memberof Address6
       * @instance
       * @returns {Object}
       */
      inspectTeredo() {
        const prefix = this.getBitsBase16(0, 32);
        const bitsForUdpPort = this.getBits(80, 96);
        const udpPort = (bitsForUdpPort ^ BigInt("0xffff")).toString();
        const server4 = ipv4_1.Address4.fromHex(this.getBitsBase16(32, 64));
        const bitsForClient4 = this.getBits(96, 128);
        const client4 = ipv4_1.Address4.fromHex((bitsForClient4 ^ BigInt("0xffffffff")).toString(16));
        const flagsBase2 = this.getBitsBase2(64, 80);
        const coneNat = (0, common_1.testBit)(flagsBase2, 15);
        const reserved = (0, common_1.testBit)(flagsBase2, 14);
        const groupIndividual = (0, common_1.testBit)(flagsBase2, 8);
        const universalLocal = (0, common_1.testBit)(flagsBase2, 9);
        const nonce = BigInt(`0b${flagsBase2.slice(2, 6) + flagsBase2.slice(8, 16)}`).toString(10);
        return {
          prefix: `${prefix.slice(0, 4)}:${prefix.slice(4, 8)}`,
          server4: server4.address,
          client4: client4.address,
          flags: flagsBase2,
          coneNat,
          microsoft: {
            reserved,
            universalLocal,
            groupIndividual,
            nonce
          },
          udpPort
        };
      }
      /**
       * Return an object containing the 6to4 properties of the address
       * @memberof Address6
       * @instance
       * @returns {Object}
       */
      inspect6to4() {
        const prefix = this.getBitsBase16(0, 16);
        const gateway = ipv4_1.Address4.fromHex(this.getBitsBase16(16, 48));
        return {
          prefix: prefix.slice(0, 4),
          gateway: gateway.address
        };
      }
      /**
       * Return a v6 6to4 address from a v6 v4inv6 address
       * @memberof Address6
       * @instance
       * @returns {Address6}
       */
      to6to4() {
        if (!this.is4()) {
          return null;
        }
        const addr6to4 = [
          "2002",
          this.getBitsBase16(96, 112),
          this.getBitsBase16(112, 128),
          "",
          "/16"
        ].join(":");
        return new _Address6(addr6to4);
      }
      /**
       * Return a byte array
       * @memberof Address6
       * @instance
       * @returns {Array}
       */
      toByteArray() {
        const valueWithoutPadding = this.bigInt().toString(16);
        const leadingPad = "0".repeat(valueWithoutPadding.length % 2);
        const value = `${leadingPad}${valueWithoutPadding}`;
        const bytes = [];
        for (let i = 0, length = value.length; i < length; i += 2) {
          bytes.push(parseInt(value.substring(i, i + 2), 16));
        }
        return bytes;
      }
      /**
       * Return an unsigned byte array
       * @memberof Address6
       * @instance
       * @returns {Array}
       */
      toUnsignedByteArray() {
        return this.toByteArray().map(unsignByte);
      }
      /**
       * Convert a byte array to an Address6 object
       * @memberof Address6
       * @static
       * @returns {Address6}
       */
      static fromByteArray(bytes) {
        return this.fromUnsignedByteArray(bytes.map(unsignByte));
      }
      /**
       * Convert an unsigned byte array to an Address6 object
       * @memberof Address6
       * @static
       * @returns {Address6}
       */
      static fromUnsignedByteArray(bytes) {
        const BYTE_MAX = BigInt("256");
        let result = BigInt("0");
        let multiplier = BigInt("1");
        for (let i = bytes.length - 1; i >= 0; i--) {
          result += multiplier * BigInt(bytes[i].toString(10));
          multiplier *= BYTE_MAX;
        }
        return _Address6.fromBigInt(result);
      }
      /**
       * Returns true if the address is in the canonical form, false otherwise
       * @memberof Address6
       * @instance
       * @returns {boolean}
       */
      isCanonical() {
        return this.addressMinusSuffix === this.canonicalForm();
      }
      /**
       * Returns true if the address is a link local address, false otherwise
       * @memberof Address6
       * @instance
       * @returns {boolean}
       */
      isLinkLocal() {
        if (this.getBitsBase2(0, 64) === "1111111010000000000000000000000000000000000000000000000000000000") {
          return true;
        }
        return false;
      }
      /**
       * Returns true if the address is a multicast address, false otherwise
       * @memberof Address6
       * @instance
       * @returns {boolean}
       */
      isMulticast() {
        return this.getType() === "Multicast";
      }
      /**
       * Returns true if the address is a v4-in-v6 address, false otherwise
       * @memberof Address6
       * @instance
       * @returns {boolean}
       */
      is4() {
        return this.v4;
      }
      /**
       * Returns true if the address is a Teredo address, false otherwise
       * @memberof Address6
       * @instance
       * @returns {boolean}
       */
      isTeredo() {
        return this.isInSubnet(new _Address6("2001::/32"));
      }
      /**
       * Returns true if the address is a 6to4 address, false otherwise
       * @memberof Address6
       * @instance
       * @returns {boolean}
       */
      is6to4() {
        return this.isInSubnet(new _Address6("2002::/16"));
      }
      /**
       * Returns true if the address is a loopback address, false otherwise
       * @memberof Address6
       * @instance
       * @returns {boolean}
       */
      isLoopback() {
        return this.getType() === "Loopback";
      }
      // #endregion
      // #region HTML
      /**
       * @returns {String} the address in link form with a default port of 80
       */
      href(optionalPort) {
        if (optionalPort === void 0) {
          optionalPort = "";
        } else {
          optionalPort = `:${optionalPort}`;
        }
        return `http://[${this.correctForm()}]${optionalPort}/`;
      }
      /**
       * @returns {String} a link suitable for conveying the address via a URL hash
       */
      link(options) {
        if (!options) {
          options = {};
        }
        if (options.className === void 0) {
          options.className = "";
        }
        if (options.prefix === void 0) {
          options.prefix = "/#address=";
        }
        if (options.v4 === void 0) {
          options.v4 = false;
        }
        let formFunction = this.correctForm;
        if (options.v4) {
          formFunction = this.to4in6;
        }
        const form = formFunction.call(this);
        if (options.className) {
          return `<a href="${options.prefix}${form}" class="${options.className}">${form}</a>`;
        }
        return `<a href="${options.prefix}${form}">${form}</a>`;
      }
      /**
       * Groups an address
       * @returns {String}
       */
      group() {
        if (this.elidedGroups === 0) {
          return helpers.simpleGroup(this.address).join(":");
        }
        assert(typeof this.elidedGroups === "number");
        assert(typeof this.elisionBegin === "number");
        const output = [];
        const [left, right] = this.address.split("::");
        if (left.length) {
          output.push(...helpers.simpleGroup(left));
        } else {
          output.push("");
        }
        const classes = ["hover-group"];
        for (let i = this.elisionBegin; i < this.elisionBegin + this.elidedGroups; i++) {
          classes.push(`group-${i}`);
        }
        output.push(`<span class="${classes.join(" ")}"></span>`);
        if (right.length) {
          output.push(...helpers.simpleGroup(right, this.elisionEnd));
        } else {
          output.push("");
        }
        if (this.is4()) {
          assert(this.address4 instanceof ipv4_1.Address4);
          output.pop();
          output.push(this.address4.groupForV6());
        }
        return output.join(":");
      }
      // #endregion
      // #region Regular expressions
      /**
       * Generate a regular expression string that can be used to find or validate
       * all variations of this address
       * @memberof Address6
       * @instance
       * @param {boolean} substringSearch
       * @returns {string}
       */
      regularExpressionString(substringSearch = false) {
        let output = [];
        const address6 = new _Address6(this.correctForm());
        if (address6.elidedGroups === 0) {
          output.push((0, regular_expressions_1.simpleRegularExpression)(address6.parsedAddress));
        } else if (address6.elidedGroups === constants6.GROUPS) {
          output.push((0, regular_expressions_1.possibleElisions)(constants6.GROUPS));
        } else {
          const halves = address6.address.split("::");
          if (halves[0].length) {
            output.push((0, regular_expressions_1.simpleRegularExpression)(halves[0].split(":")));
          }
          assert(typeof address6.elidedGroups === "number");
          output.push((0, regular_expressions_1.possibleElisions)(address6.elidedGroups, halves[0].length !== 0, halves[1].length !== 0));
          if (halves[1].length) {
            output.push((0, regular_expressions_1.simpleRegularExpression)(halves[1].split(":")));
          }
          output = [output.join(":")];
        }
        if (!substringSearch) {
          output = [
            "(?=^|",
            regular_expressions_1.ADDRESS_BOUNDARY,
            "|[^\\w\\:])(",
            ...output,
            ")(?=[^\\w\\:]|",
            regular_expressions_1.ADDRESS_BOUNDARY,
            "|$)"
          ];
        }
        return output.join("");
      }
      /**
       * Generate a regular expression that can be used to find or validate all
       * variations of this address.
       * @memberof Address6
       * @instance
       * @param {boolean} substringSearch
       * @returns {RegExp}
       */
      regularExpression(substringSearch = false) {
        return new RegExp(this.regularExpressionString(substringSearch), "i");
      }
    };
    exports.Address6 = Address62;
  }
});

// node_modules/ip-address/dist/ip-address.js
var require_ip_address = __commonJS({
  "node_modules/ip-address/dist/ip-address.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports && exports.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.v6 = exports.AddressError = exports.Address6 = exports.Address4 = void 0;
    var ipv4_1 = require_ipv4();
    Object.defineProperty(exports, "Address4", { enumerable: true, get: function() {
      return ipv4_1.Address4;
    } });
    var ipv6_1 = require_ipv6();
    Object.defineProperty(exports, "Address6", { enumerable: true, get: function() {
      return ipv6_1.Address6;
    } });
    var address_error_1 = require_address_error();
    Object.defineProperty(exports, "AddressError", { enumerable: true, get: function() {
      return address_error_1.AddressError;
    } });
    var helpers = __importStar(require_helpers());
    exports.v6 = { helpers };
  }
});

// src/services/sqlite/Observations.ts
var Observations_exports = {};
__export(Observations_exports, {
  consolidateObservations: () => consolidateObservations,
  createObservation: () => createObservation,
  deleteObservation: () => deleteObservation,
  getObservationsByProject: () => getObservationsByProject,
  getObservationsBySession: () => getObservationsBySession,
  isDuplicateObservation: () => isDuplicateObservation,
  searchObservations: () => searchObservations,
  updateLastAccessed: () => updateLastAccessed
});
function escapeLikePattern(input) {
  return input.replace(/[%_\\]/g, "\\$&");
}
function isDuplicateObservation(db2, contentHash, windowMs = 3e4) {
  if (!contentHash) return false;
  const threshold = Date.now() - windowMs;
  const result = db2.query(
    "SELECT id FROM observations WHERE content_hash = ? AND created_at_epoch > ? LIMIT 1"
  ).get(contentHash, threshold);
  return !!result;
}
function createObservation(db2, memorySessionId, project, type, title, subtitle, text, narrative, facts, concepts, filesRead, filesModified, promptNumber, contentHash = null, discoveryTokens = 0) {
  const now = /* @__PURE__ */ new Date();
  const result = db2.run(
    `INSERT INTO observations
     (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts, files_read, files_modified, prompt_number, created_at, created_at_epoch, content_hash, discovery_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [memorySessionId, project, type, title, subtitle, text, narrative, facts, concepts, filesRead, filesModified, promptNumber, now.toISOString(), now.getTime(), contentHash, discoveryTokens]
  );
  return Number(result.lastInsertRowid);
}
function getObservationsBySession(db2, memorySessionId) {
  const query = db2.query(
    "SELECT * FROM observations WHERE memory_session_id = ? ORDER BY prompt_number ASC"
  );
  return query.all(memorySessionId);
}
function getObservationsByProject(db2, project, limit = 100) {
  const query = db2.query(
    "SELECT * FROM observations WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ?"
  );
  return query.all(project, limit);
}
function searchObservations(db2, searchTerm, project) {
  const sql = project ? `SELECT * FROM observations
       WHERE project = ? AND (title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\')
       ORDER BY created_at_epoch DESC` : `SELECT * FROM observations
       WHERE title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\'
       ORDER BY created_at_epoch DESC`;
  const pattern = `%${escapeLikePattern(searchTerm)}%`;
  const query = db2.query(sql);
  if (project) {
    return query.all(project, pattern, pattern, pattern);
  }
  return query.all(pattern, pattern, pattern);
}
function deleteObservation(db2, id) {
  db2.run("DELETE FROM observations WHERE id = ?", [id]);
}
function updateLastAccessed(db2, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const validIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id) && id > 0).slice(0, 500);
  if (validIds.length === 0) return;
  const now = Date.now();
  const placeholders = validIds.map(() => "?").join(",");
  db2.run(
    `UPDATE observations SET last_accessed_epoch = ? WHERE id IN (${placeholders})`,
    [now, ...validIds]
  );
}
function consolidateObservations(db2, project, options = {}) {
  const minGroupSize = options.minGroupSize || 3;
  const groups = db2.query(`
    SELECT type, files_modified, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
    FROM observations
    WHERE project = ? AND files_modified IS NOT NULL AND files_modified != ''
    GROUP BY type, files_modified
    HAVING cnt >= ?
    ORDER BY cnt DESC
  `).all(project, minGroupSize);
  if (groups.length === 0) return { merged: 0, removed: 0 };
  let totalMerged = 0;
  let totalRemoved = 0;
  const runConsolidation = db2.transaction(() => {
    for (const group of groups) {
      const obsIds = group.ids.split(",").map(Number);
      const placeholders = obsIds.map(() => "?").join(",");
      const observations = db2.query(
        `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at_epoch DESC`
      ).all(...obsIds);
      if (observations.length < minGroupSize) continue;
      if (options.dryRun) {
        totalMerged += 1;
        totalRemoved += observations.length - 1;
        continue;
      }
      const keeper = observations[0];
      const others = observations.slice(1);
      const uniqueTexts = /* @__PURE__ */ new Set();
      if (keeper.text) uniqueTexts.add(keeper.text);
      for (const obs of others) {
        if (obs.text && !uniqueTexts.has(obs.text)) {
          uniqueTexts.add(obs.text);
        }
      }
      const consolidatedText = Array.from(uniqueTexts).join("\n---\n").substring(0, 1e5);
      db2.run(
        "UPDATE observations SET text = ?, title = ? WHERE id = ?",
        [consolidatedText, `[consolidato x${observations.length}] ${keeper.title}`, keeper.id]
      );
      const removeIds = others.map((o) => o.id);
      const removePlaceholders = removeIds.map(() => "?").join(",");
      db2.run(`DELETE FROM observations WHERE id IN (${removePlaceholders})`, removeIds);
      db2.run(`DELETE FROM observation_embeddings WHERE observation_id IN (${removePlaceholders})`, removeIds);
      totalMerged += 1;
      totalRemoved += removeIds.length;
    }
  });
  runConsolidation();
  return { merged: totalMerged, removed: totalRemoved };
}
var init_Observations = __esm({
  "src/services/sqlite/Observations.ts"() {
    "use strict";
  }
});

// src/services/sqlite/Search.ts
var Search_exports = {};
__export(Search_exports, {
  getObservationsByIds: () => getObservationsByIds,
  getProjectStats: () => getProjectStats,
  getStaleObservations: () => getStaleObservations,
  getTimeline: () => getTimeline,
  markObservationsStale: () => markObservationsStale,
  searchObservationsFTS: () => searchObservationsFTS,
  searchObservationsFTSWithRank: () => searchObservationsFTSWithRank,
  searchObservationsLIKE: () => searchObservationsLIKE,
  searchSummariesFiltered: () => searchSummariesFiltered
});
import { existsSync as existsSync3, statSync } from "fs";
function escapeLikePattern2(input) {
  return input.replace(/[%_\\]/g, "\\$&");
}
function sanitizeFTS5Query(query) {
  const trimmed = query.length > 1e4 ? query.substring(0, 1e4) : query;
  const terms = trimmed.replace(/[""]/g, "").split(/\s+/).filter((t) => t.length > 0).slice(0, 100).map((t) => `"${t}"`);
  return terms.join(" ");
}
function searchObservationsFTS(db2, query, filters = {}) {
  const limit = filters.limit || 50;
  try {
    const safeQuery = sanitizeFTS5Query(query);
    if (!safeQuery) return searchObservationsLIKE(db2, query, filters);
    let sql = `
      SELECT o.* FROM observations o
      JOIN observations_fts fts ON o.id = fts.rowid
      WHERE observations_fts MATCH ?
    `;
    const params = [safeQuery];
    if (filters.project) {
      sql += " AND o.project = ?";
      params.push(filters.project);
    }
    if (filters.type) {
      sql += " AND o.type = ?";
      params.push(filters.type);
    }
    if (filters.dateStart) {
      sql += " AND o.created_at_epoch >= ?";
      params.push(filters.dateStart);
    }
    if (filters.dateEnd) {
      sql += " AND o.created_at_epoch <= ?";
      params.push(filters.dateEnd);
    }
    sql += ` ORDER BY bm25(observations_fts, ${BM25_WEIGHTS}) LIMIT ?`;
    params.push(limit);
    const stmt = db2.query(sql);
    return stmt.all(...params);
  } catch {
    return searchObservationsLIKE(db2, query, filters);
  }
}
function searchObservationsFTSWithRank(db2, query, filters = {}) {
  const limit = filters.limit || 50;
  try {
    const safeQuery = sanitizeFTS5Query(query);
    if (!safeQuery) return [];
    let sql = `
      SELECT o.*, bm25(observations_fts, ${BM25_WEIGHTS}) as fts5_rank FROM observations o
      JOIN observations_fts fts ON o.id = fts.rowid
      WHERE observations_fts MATCH ?
    `;
    const params = [safeQuery];
    if (filters.project) {
      sql += " AND o.project = ?";
      params.push(filters.project);
    }
    if (filters.type) {
      sql += " AND o.type = ?";
      params.push(filters.type);
    }
    if (filters.dateStart) {
      sql += " AND o.created_at_epoch >= ?";
      params.push(filters.dateStart);
    }
    if (filters.dateEnd) {
      sql += " AND o.created_at_epoch <= ?";
      params.push(filters.dateEnd);
    }
    sql += ` ORDER BY bm25(observations_fts, ${BM25_WEIGHTS}) LIMIT ?`;
    params.push(limit);
    const stmt = db2.query(sql);
    return stmt.all(...params);
  } catch {
    return [];
  }
}
function searchObservationsLIKE(db2, query, filters = {}) {
  const limit = filters.limit || 50;
  const pattern = `%${escapeLikePattern2(query)}%`;
  let sql = `
    SELECT * FROM observations
    WHERE (title LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR narrative LIKE ? ESCAPE '\\' OR concepts LIKE ? ESCAPE '\\')
  `;
  const params = [pattern, pattern, pattern, pattern];
  if (filters.project) {
    sql += " AND project = ?";
    params.push(filters.project);
  }
  if (filters.type) {
    sql += " AND type = ?";
    params.push(filters.type);
  }
  if (filters.dateStart) {
    sql += " AND created_at_epoch >= ?";
    params.push(filters.dateStart);
  }
  if (filters.dateEnd) {
    sql += " AND created_at_epoch <= ?";
    params.push(filters.dateEnd);
  }
  sql += " ORDER BY created_at_epoch DESC LIMIT ?";
  params.push(limit);
  const stmt = db2.query(sql);
  return stmt.all(...params);
}
function searchSummariesFiltered(db2, query, filters = {}) {
  const limit = filters.limit || 20;
  const pattern = `%${escapeLikePattern2(query)}%`;
  let sql = `
    SELECT * FROM summaries
    WHERE (request LIKE ? ESCAPE '\\' OR learned LIKE ? ESCAPE '\\' OR completed LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR next_steps LIKE ? ESCAPE '\\')
  `;
  const params = [pattern, pattern, pattern, pattern, pattern];
  if (filters.project) {
    sql += " AND project = ?";
    params.push(filters.project);
  }
  if (filters.dateStart) {
    sql += " AND created_at_epoch >= ?";
    params.push(filters.dateStart);
  }
  if (filters.dateEnd) {
    sql += " AND created_at_epoch <= ?";
    params.push(filters.dateEnd);
  }
  sql += " ORDER BY created_at_epoch DESC LIMIT ?";
  params.push(limit);
  const stmt = db2.query(sql);
  return stmt.all(...params);
}
function getObservationsByIds(db2, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const validIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id) && id > 0).slice(0, 500);
  if (validIds.length === 0) return [];
  const placeholders = validIds.map(() => "?").join(",");
  const sql = `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at_epoch DESC`;
  const stmt = db2.query(sql);
  return stmt.all(...validIds);
}
function getTimeline(db2, anchorId, depthBefore = 5, depthAfter = 5) {
  const anchorStmt = db2.query("SELECT created_at_epoch FROM observations WHERE id = ?");
  const anchor = anchorStmt.get(anchorId);
  if (!anchor) return [];
  const anchorEpoch = anchor.created_at_epoch;
  const beforeStmt = db2.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations
    WHERE created_at_epoch < ?
    ORDER BY created_at_epoch DESC
    LIMIT ?
  `);
  const before = beforeStmt.all(anchorEpoch, depthBefore).reverse();
  const selfStmt = db2.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations WHERE id = ?
  `);
  const self = selfStmt.all(anchorId);
  const afterStmt = db2.query(`
    SELECT id, 'observation' as type, title, text as content, project, created_at, created_at_epoch
    FROM observations
    WHERE created_at_epoch > ?
    ORDER BY created_at_epoch ASC
    LIMIT ?
  `);
  const after = afterStmt.all(anchorEpoch, depthAfter);
  return [...before, ...self, ...after];
}
function getProjectStats(db2, project) {
  const obsStmt = db2.query("SELECT COUNT(*) as count FROM observations WHERE project = ?");
  const sumStmt = db2.query("SELECT COUNT(*) as count FROM summaries WHERE project = ?");
  const sesStmt = db2.query("SELECT COUNT(*) as count FROM sessions WHERE project = ?");
  const prmStmt = db2.query("SELECT COUNT(*) as count FROM prompts WHERE project = ?");
  const discoveryStmt = db2.query(
    "SELECT COALESCE(SUM(discovery_tokens), 0) as total FROM observations WHERE project = ?"
  );
  const discoveryTokens = discoveryStmt.get(project)?.total || 0;
  const readStmt = db2.query(
    `SELECT COALESCE(SUM(
      CAST((LENGTH(COALESCE(title, '')) + LENGTH(COALESCE(narrative, ''))) / 4 AS INTEGER)
    ), 0) as total FROM observations WHERE project = ?`
  );
  const readTokens = readStmt.get(project)?.total || 0;
  const savings = Math.max(0, discoveryTokens - readTokens);
  return {
    observations: obsStmt.get(project)?.count || 0,
    summaries: sumStmt.get(project)?.count || 0,
    sessions: sesStmt.get(project)?.count || 0,
    prompts: prmStmt.get(project)?.count || 0,
    tokenEconomics: { discoveryTokens, readTokens, savings }
  };
}
function getStaleObservations(db2, project) {
  const rows = db2.query(`
    SELECT * FROM observations
    WHERE project = ? AND files_modified IS NOT NULL AND files_modified != ''
    ORDER BY created_at_epoch DESC
    LIMIT 500
  `).all(project);
  const staleObs = [];
  for (const obs of rows) {
    if (!obs.files_modified) continue;
    const files = obs.files_modified.split(",").map((f) => f.trim()).filter(Boolean);
    let isStale = false;
    for (const filepath of files) {
      try {
        if (!existsSync3(filepath)) continue;
        const stat = statSync(filepath);
        if (stat.mtimeMs > obs.created_at_epoch) {
          isStale = true;
          break;
        }
      } catch {
      }
    }
    if (isStale) {
      staleObs.push(obs);
    }
  }
  return staleObs;
}
function markObservationsStale(db2, ids, stale) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const validIds = ids.filter((id) => typeof id === "number" && Number.isInteger(id) && id > 0).slice(0, 500);
  if (validIds.length === 0) return;
  const placeholders = validIds.map(() => "?").join(",");
  db2.run(
    `UPDATE observations SET is_stale = ? WHERE id IN (${placeholders})`,
    [stale ? 1 : 0, ...validIds]
  );
}
var BM25_WEIGHTS;
var init_Search = __esm({
  "src/services/sqlite/Search.ts"() {
    "use strict";
    BM25_WEIGHTS = "10.0, 1.0, 5.0, 3.0";
  }
});

// src/services/worker-service.ts
import express from "express";
import cors from "cors";

// node_modules/helmet/index.mjs
var dangerouslyDisableDefaultSrc = /* @__PURE__ */ Symbol("dangerouslyDisableDefaultSrc");
var SHOULD_BE_QUOTED = /* @__PURE__ */ new Set(["none", "self", "strict-dynamic", "report-sample", "inline-speculation-rules", "unsafe-inline", "unsafe-eval", "unsafe-hashes", "wasm-unsafe-eval"]);
var getDefaultDirectives = () => ({
  "default-src": ["'self'"],
  "base-uri": ["'self'"],
  "font-src": ["'self'", "https:", "data:"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'self'"],
  "img-src": ["'self'", "data:"],
  "object-src": ["'none'"],
  "script-src": ["'self'"],
  "script-src-attr": ["'none'"],
  "style-src": ["'self'", "https:", "'unsafe-inline'"],
  "upgrade-insecure-requests": []
});
var dashify = (str) => str.replace(/[A-Z]/g, (capitalLetter) => "-" + capitalLetter.toLowerCase());
var assertDirectiveValueIsValid = (directiveName, directiveValue) => {
  if (/;|,/.test(directiveValue)) {
    throw new Error(`Content-Security-Policy received an invalid directive value for ${JSON.stringify(directiveName)}`);
  }
};
var assertDirectiveValueEntryIsValid = (directiveName, directiveValueEntry) => {
  if (SHOULD_BE_QUOTED.has(directiveValueEntry) || directiveValueEntry.startsWith("nonce-") || directiveValueEntry.startsWith("sha256-") || directiveValueEntry.startsWith("sha384-") || directiveValueEntry.startsWith("sha512-")) {
    throw new Error(`Content-Security-Policy received an invalid directive value for ${JSON.stringify(directiveName)}. ${JSON.stringify(directiveValueEntry)} should be quoted`);
  }
};
function normalizeDirectives(options) {
  const defaultDirectives = getDefaultDirectives();
  const { useDefaults = true, directives: rawDirectives = defaultDirectives } = options;
  const result = /* @__PURE__ */ new Map();
  const directiveNamesSeen = /* @__PURE__ */ new Set();
  const directivesExplicitlyDisabled = /* @__PURE__ */ new Set();
  for (const rawDirectiveName in rawDirectives) {
    if (!Object.hasOwn(rawDirectives, rawDirectiveName)) {
      continue;
    }
    if (rawDirectiveName.length === 0 || /[^a-zA-Z0-9-]/.test(rawDirectiveName)) {
      throw new Error(`Content-Security-Policy received an invalid directive name ${JSON.stringify(rawDirectiveName)}`);
    }
    const directiveName = dashify(rawDirectiveName);
    if (directiveNamesSeen.has(directiveName)) {
      throw new Error(`Content-Security-Policy received a duplicate directive ${JSON.stringify(directiveName)}`);
    }
    directiveNamesSeen.add(directiveName);
    const rawDirectiveValue = rawDirectives[rawDirectiveName];
    let directiveValue;
    if (rawDirectiveValue === null) {
      if (directiveName === "default-src") {
        throw new Error("Content-Security-Policy needs a default-src but it was set to `null`. If you really want to disable it, set it to `contentSecurityPolicy.dangerouslyDisableDefaultSrc`.");
      }
      directivesExplicitlyDisabled.add(directiveName);
      continue;
    } else if (typeof rawDirectiveValue === "string") {
      directiveValue = [rawDirectiveValue];
    } else if (!rawDirectiveValue) {
      throw new Error(`Content-Security-Policy received an invalid directive value for ${JSON.stringify(directiveName)}`);
    } else if (rawDirectiveValue === dangerouslyDisableDefaultSrc) {
      if (directiveName === "default-src") {
        directivesExplicitlyDisabled.add("default-src");
        continue;
      } else {
        throw new Error(`Content-Security-Policy: tried to disable ${JSON.stringify(directiveName)} as if it were default-src; simply omit the key`);
      }
    } else {
      directiveValue = rawDirectiveValue;
    }
    for (const element of directiveValue) {
      if (typeof element !== "string") continue;
      assertDirectiveValueIsValid(directiveName, element);
      assertDirectiveValueEntryIsValid(directiveName, element);
    }
    result.set(directiveName, directiveValue);
  }
  if (useDefaults) {
    Object.entries(defaultDirectives).forEach(([defaultDirectiveName, defaultDirectiveValue]) => {
      if (!result.has(defaultDirectiveName) && !directivesExplicitlyDisabled.has(defaultDirectiveName)) {
        result.set(defaultDirectiveName, defaultDirectiveValue);
      }
    });
  }
  if (!result.size) {
    throw new Error("Content-Security-Policy has no directives. Either set some or disable the header");
  }
  if (!result.has("default-src") && !directivesExplicitlyDisabled.has("default-src")) {
    throw new Error("Content-Security-Policy needs a default-src but none was provided. If you really want to disable it, set it to `contentSecurityPolicy.dangerouslyDisableDefaultSrc`.");
  }
  return result;
}
function getHeaderValue(req, res, normalizedDirectives) {
  const result = [];
  for (const [directiveName, rawDirectiveValue] of normalizedDirectives) {
    let directiveValue = "";
    for (const element of rawDirectiveValue) {
      if (typeof element === "function") {
        const newElement = element(req, res);
        assertDirectiveValueEntryIsValid(directiveName, newElement);
        directiveValue += " " + newElement;
      } else {
        directiveValue += " " + element;
      }
    }
    if (directiveValue) {
      assertDirectiveValueIsValid(directiveName, directiveValue);
      result.push(`${directiveName}${directiveValue}`);
    } else {
      result.push(directiveName);
    }
  }
  return result.join(";");
}
var contentSecurityPolicy = function contentSecurityPolicy2(options = {}) {
  const headerName = options.reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  const normalizedDirectives = normalizeDirectives(options);
  return function contentSecurityPolicyMiddleware(req, res, next) {
    const result = getHeaderValue(req, res, normalizedDirectives);
    if (result instanceof Error) {
      next(result);
    } else {
      res.setHeader(headerName, result);
      next();
    }
  };
};
contentSecurityPolicy.getDefaultDirectives = getDefaultDirectives;
contentSecurityPolicy.dangerouslyDisableDefaultSrc = dangerouslyDisableDefaultSrc;
var ALLOWED_POLICIES$2 = /* @__PURE__ */ new Set(["require-corp", "credentialless", "unsafe-none"]);
function getHeaderValueFromOptions$6({ policy = "require-corp" }) {
  if (ALLOWED_POLICIES$2.has(policy)) {
    return policy;
  } else {
    throw new Error(`Cross-Origin-Embedder-Policy does not support the ${JSON.stringify(policy)} policy`);
  }
}
function crossOriginEmbedderPolicy(options = {}) {
  const headerValue = getHeaderValueFromOptions$6(options);
  return function crossOriginEmbedderPolicyMiddleware(_req, res, next) {
    res.setHeader("Cross-Origin-Embedder-Policy", headerValue);
    next();
  };
}
var ALLOWED_POLICIES$1 = /* @__PURE__ */ new Set(["same-origin", "same-origin-allow-popups", "unsafe-none"]);
function getHeaderValueFromOptions$5({ policy = "same-origin" }) {
  if (ALLOWED_POLICIES$1.has(policy)) {
    return policy;
  } else {
    throw new Error(`Cross-Origin-Opener-Policy does not support the ${JSON.stringify(policy)} policy`);
  }
}
function crossOriginOpenerPolicy(options = {}) {
  const headerValue = getHeaderValueFromOptions$5(options);
  return function crossOriginOpenerPolicyMiddleware(_req, res, next) {
    res.setHeader("Cross-Origin-Opener-Policy", headerValue);
    next();
  };
}
var ALLOWED_POLICIES = /* @__PURE__ */ new Set(["same-origin", "same-site", "cross-origin"]);
function getHeaderValueFromOptions$4({ policy = "same-origin" }) {
  if (ALLOWED_POLICIES.has(policy)) {
    return policy;
  } else {
    throw new Error(`Cross-Origin-Resource-Policy does not support the ${JSON.stringify(policy)} policy`);
  }
}
function crossOriginResourcePolicy(options = {}) {
  const headerValue = getHeaderValueFromOptions$4(options);
  return function crossOriginResourcePolicyMiddleware(_req, res, next) {
    res.setHeader("Cross-Origin-Resource-Policy", headerValue);
    next();
  };
}
function originAgentCluster() {
  return function originAgentClusterMiddleware(_req, res, next) {
    res.setHeader("Origin-Agent-Cluster", "?1");
    next();
  };
}
var ALLOWED_TOKENS = /* @__PURE__ */ new Set(["no-referrer", "no-referrer-when-downgrade", "same-origin", "origin", "strict-origin", "origin-when-cross-origin", "strict-origin-when-cross-origin", "unsafe-url", ""]);
function getHeaderValueFromOptions$3({ policy = ["no-referrer"] }) {
  const tokens = typeof policy === "string" ? [policy] : policy;
  if (tokens.length === 0) {
    throw new Error("Referrer-Policy received no policy tokens");
  }
  const tokensSeen = /* @__PURE__ */ new Set();
  tokens.forEach((token) => {
    if (!ALLOWED_TOKENS.has(token)) {
      throw new Error(`Referrer-Policy received an unexpected policy token ${JSON.stringify(token)}`);
    } else if (tokensSeen.has(token)) {
      throw new Error(`Referrer-Policy received a duplicate policy token ${JSON.stringify(token)}`);
    }
    tokensSeen.add(token);
  });
  return tokens.join(",");
}
function referrerPolicy(options = {}) {
  const headerValue = getHeaderValueFromOptions$3(options);
  return function referrerPolicyMiddleware(_req, res, next) {
    res.setHeader("Referrer-Policy", headerValue);
    next();
  };
}
var DEFAULT_MAX_AGE = 365 * 24 * 60 * 60;
function parseMaxAge(value = DEFAULT_MAX_AGE) {
  if (value >= 0 && Number.isFinite(value)) {
    return Math.floor(value);
  } else {
    throw new Error(`Strict-Transport-Security: ${JSON.stringify(value)} is not a valid value for maxAge. Please choose a positive integer.`);
  }
}
function getHeaderValueFromOptions$2(options) {
  if ("maxage" in options) {
    throw new Error("Strict-Transport-Security received an unsupported property, `maxage`. Did you mean to pass `maxAge`?");
  }
  if ("includeSubdomains" in options) {
    throw new Error('Strict-Transport-Security middleware should use `includeSubDomains` instead of `includeSubdomains`. (The correct one has an uppercase "D".)');
  }
  const directives = [`max-age=${parseMaxAge(options.maxAge)}`];
  if (options.includeSubDomains === void 0 || options.includeSubDomains) {
    directives.push("includeSubDomains");
  }
  if (options.preload) {
    directives.push("preload");
  }
  return directives.join("; ");
}
function strictTransportSecurity(options = {}) {
  const headerValue = getHeaderValueFromOptions$2(options);
  return function strictTransportSecurityMiddleware(_req, res, next) {
    res.setHeader("Strict-Transport-Security", headerValue);
    next();
  };
}
function xContentTypeOptions() {
  return function xContentTypeOptionsMiddleware(_req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  };
}
function xDnsPrefetchControl(options = {}) {
  const headerValue = options.allow ? "on" : "off";
  return function xDnsPrefetchControlMiddleware(_req, res, next) {
    res.setHeader("X-DNS-Prefetch-Control", headerValue);
    next();
  };
}
function xDownloadOptions() {
  return function xDownloadOptionsMiddleware(_req, res, next) {
    res.setHeader("X-Download-Options", "noopen");
    next();
  };
}
function getHeaderValueFromOptions$1({ action = "sameorigin" }) {
  const normalizedAction = typeof action === "string" ? action.toUpperCase() : action;
  switch (normalizedAction) {
    case "SAME-ORIGIN":
      return "SAMEORIGIN";
    case "DENY":
    case "SAMEORIGIN":
      return normalizedAction;
    default:
      throw new Error(`X-Frame-Options received an invalid action ${JSON.stringify(action)}`);
  }
}
function xFrameOptions(options = {}) {
  const headerValue = getHeaderValueFromOptions$1(options);
  return function xFrameOptionsMiddleware(_req, res, next) {
    res.setHeader("X-Frame-Options", headerValue);
    next();
  };
}
var ALLOWED_PERMITTED_POLICIES = /* @__PURE__ */ new Set(["none", "master-only", "by-content-type", "all"]);
function getHeaderValueFromOptions({ permittedPolicies = "none" }) {
  if (ALLOWED_PERMITTED_POLICIES.has(permittedPolicies)) {
    return permittedPolicies;
  } else {
    throw new Error(`X-Permitted-Cross-Domain-Policies does not support ${JSON.stringify(permittedPolicies)}`);
  }
}
function xPermittedCrossDomainPolicies(options = {}) {
  const headerValue = getHeaderValueFromOptions(options);
  return function xPermittedCrossDomainPoliciesMiddleware(_req, res, next) {
    res.setHeader("X-Permitted-Cross-Domain-Policies", headerValue);
    next();
  };
}
function xPoweredBy() {
  return function xPoweredByMiddleware(_req, res, next) {
    res.removeHeader("X-Powered-By");
    next();
  };
}
function xXssProtection() {
  return function xXssProtectionMiddleware(_req, res, next) {
    res.setHeader("X-XSS-Protection", "0");
    next();
  };
}
function getMiddlewareFunctionsFromOptions(options) {
  const result = [];
  switch (options.contentSecurityPolicy) {
    case void 0:
    case true:
      result.push(contentSecurityPolicy());
      break;
    case false:
      break;
    default:
      result.push(contentSecurityPolicy(options.contentSecurityPolicy));
      break;
  }
  switch (options.crossOriginEmbedderPolicy) {
    case void 0:
    case false:
      break;
    case true:
      result.push(crossOriginEmbedderPolicy());
      break;
    default:
      result.push(crossOriginEmbedderPolicy(options.crossOriginEmbedderPolicy));
      break;
  }
  switch (options.crossOriginOpenerPolicy) {
    case void 0:
    case true:
      result.push(crossOriginOpenerPolicy());
      break;
    case false:
      break;
    default:
      result.push(crossOriginOpenerPolicy(options.crossOriginOpenerPolicy));
      break;
  }
  switch (options.crossOriginResourcePolicy) {
    case void 0:
    case true:
      result.push(crossOriginResourcePolicy());
      break;
    case false:
      break;
    default:
      result.push(crossOriginResourcePolicy(options.crossOriginResourcePolicy));
      break;
  }
  switch (options.originAgentCluster) {
    case void 0:
    case true:
      result.push(originAgentCluster());
      break;
    case false:
      break;
    default:
      console.warn("Origin-Agent-Cluster does not take options. Remove the property to silence this warning.");
      result.push(originAgentCluster());
      break;
  }
  switch (options.referrerPolicy) {
    case void 0:
    case true:
      result.push(referrerPolicy());
      break;
    case false:
      break;
    default:
      result.push(referrerPolicy(options.referrerPolicy));
      break;
  }
  if ("strictTransportSecurity" in options && "hsts" in options) {
    throw new Error("Strict-Transport-Security option was specified twice. Remove `hsts` to silence this warning.");
  }
  const strictTransportSecurityOption = options.strictTransportSecurity ?? options.hsts;
  switch (strictTransportSecurityOption) {
    case void 0:
    case true:
      result.push(strictTransportSecurity());
      break;
    case false:
      break;
    default:
      result.push(strictTransportSecurity(strictTransportSecurityOption));
      break;
  }
  if ("xContentTypeOptions" in options && "noSniff" in options) {
    throw new Error("X-Content-Type-Options option was specified twice. Remove `noSniff` to silence this warning.");
  }
  const xContentTypeOptionsOption = options.xContentTypeOptions ?? options.noSniff;
  switch (xContentTypeOptionsOption) {
    case void 0:
    case true:
      result.push(xContentTypeOptions());
      break;
    case false:
      break;
    default:
      console.warn("X-Content-Type-Options does not take options. Remove the property to silence this warning.");
      result.push(xContentTypeOptions());
      break;
  }
  if ("xDnsPrefetchControl" in options && "dnsPrefetchControl" in options) {
    throw new Error("X-DNS-Prefetch-Control option was specified twice. Remove `dnsPrefetchControl` to silence this warning.");
  }
  const xDnsPrefetchControlOption = options.xDnsPrefetchControl ?? options.dnsPrefetchControl;
  switch (xDnsPrefetchControlOption) {
    case void 0:
    case true:
      result.push(xDnsPrefetchControl());
      break;
    case false:
      break;
    default:
      result.push(xDnsPrefetchControl(xDnsPrefetchControlOption));
      break;
  }
  if ("xDownloadOptions" in options && "ieNoOpen" in options) {
    throw new Error("X-Download-Options option was specified twice. Remove `ieNoOpen` to silence this warning.");
  }
  const xDownloadOptionsOption = options.xDownloadOptions ?? options.ieNoOpen;
  switch (xDownloadOptionsOption) {
    case void 0:
    case true:
      result.push(xDownloadOptions());
      break;
    case false:
      break;
    default:
      console.warn("X-Download-Options does not take options. Remove the property to silence this warning.");
      result.push(xDownloadOptions());
      break;
  }
  if ("xFrameOptions" in options && "frameguard" in options) {
    throw new Error("X-Frame-Options option was specified twice. Remove `frameguard` to silence this warning.");
  }
  const xFrameOptionsOption = options.xFrameOptions ?? options.frameguard;
  switch (xFrameOptionsOption) {
    case void 0:
    case true:
      result.push(xFrameOptions());
      break;
    case false:
      break;
    default:
      result.push(xFrameOptions(xFrameOptionsOption));
      break;
  }
  if ("xPermittedCrossDomainPolicies" in options && "permittedCrossDomainPolicies" in options) {
    throw new Error("X-Permitted-Cross-Domain-Policies option was specified twice. Remove `permittedCrossDomainPolicies` to silence this warning.");
  }
  const xPermittedCrossDomainPoliciesOption = options.xPermittedCrossDomainPolicies ?? options.permittedCrossDomainPolicies;
  switch (xPermittedCrossDomainPoliciesOption) {
    case void 0:
    case true:
      result.push(xPermittedCrossDomainPolicies());
      break;
    case false:
      break;
    default:
      result.push(xPermittedCrossDomainPolicies(xPermittedCrossDomainPoliciesOption));
      break;
  }
  if ("xPoweredBy" in options && "hidePoweredBy" in options) {
    throw new Error("X-Powered-By option was specified twice. Remove `hidePoweredBy` to silence this warning.");
  }
  const xPoweredByOption = options.xPoweredBy ?? options.hidePoweredBy;
  switch (xPoweredByOption) {
    case void 0:
    case true:
      result.push(xPoweredBy());
      break;
    case false:
      break;
    default:
      console.warn("X-Powered-By does not take options. Remove the property to silence this warning.");
      result.push(xPoweredBy());
      break;
  }
  if ("xXssProtection" in options && "xssFilter" in options) {
    throw new Error("X-XSS-Protection option was specified twice. Remove `xssFilter` to silence this warning.");
  }
  const xXssProtectionOption = options.xXssProtection ?? options.xssFilter;
  switch (xXssProtectionOption) {
    case void 0:
    case true:
      result.push(xXssProtection());
      break;
    case false:
      break;
    default:
      console.warn("X-XSS-Protection does not take options. Remove the property to silence this warning.");
      result.push(xXssProtection());
      break;
  }
  return result;
}
var helmet = Object.assign(
  function helmet2(options = {}) {
    if (options.constructor?.name === "IncomingMessage") {
      throw new Error("It appears you have done something like `app.use(helmet)`, but it should be `app.use(helmet())`.");
    }
    const middlewareFunctions = getMiddlewareFunctionsFromOptions(options);
    return function helmetMiddleware(req, res, next) {
      let middlewareIndex = 0;
      (function internalNext(err) {
        if (err) {
          next(err);
          return;
        }
        const middlewareFunction = middlewareFunctions[middlewareIndex];
        if (middlewareFunction) {
          middlewareIndex++;
          middlewareFunction(req, res, internalNext);
        } else {
          next();
        }
      })();
    };
  },
  {
    contentSecurityPolicy,
    crossOriginEmbedderPolicy,
    crossOriginOpenerPolicy,
    crossOriginResourcePolicy,
    originAgentCluster,
    referrerPolicy,
    strictTransportSecurity,
    xContentTypeOptions,
    xDnsPrefetchControl,
    xDownloadOptions,
    xFrameOptions,
    xPermittedCrossDomainPolicies,
    xPoweredBy,
    xXssProtection,
    // Legacy aliases
    dnsPrefetchControl: xDnsPrefetchControl,
    xssFilter: xXssProtection,
    permittedCrossDomainPolicies: xPermittedCrossDomainPolicies,
    ieNoOpen: xDownloadOptions,
    noSniff: xContentTypeOptions,
    frameguard: xFrameOptions,
    hidePoweredBy: xPoweredBy,
    hsts: strictTransportSecurity
  }
);

// node_modules/express-rate-limit/dist/index.mjs
var import_ip_address = __toESM(require_ip_address(), 1);
import { isIPv6 } from "node:net";
import { isIPv6 as isIPv62 } from "node:net";
import { Buffer as Buffer2 } from "node:buffer";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
function ipKeyGenerator(ip, ipv6Subnet = 56) {
  if (ipv6Subnet && isIPv6(ip)) {
    return `${new import_ip_address.Address6(`${ip}/${ipv6Subnet}`).startAddress().correctForm()}/${ipv6Subnet}`;
  }
  return ip;
}
var MemoryStore = class {
  constructor(validations2) {
    this.validations = validations2;
    this.previous = /* @__PURE__ */ new Map();
    this.current = /* @__PURE__ */ new Map();
    this.localKeys = true;
  }
  /**
   * Method that initializes the store.
   *
   * @param options {Options} - The options used to setup the middleware.
   */
  init(options) {
    this.windowMs = options.windowMs;
    this.validations?.windowMs(this.windowMs);
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      this.clearExpired();
    }, this.windowMs);
    this.interval.unref?.();
  }
  /**
   * Method to fetch a client's hit count and reset time.
   *
   * @param key {string} - The identifier for a client.
   *
   * @returns {ClientRateLimitInfo | undefined} - The number of hits and reset time for that client.
   *
   * @public
   */
  async get(key) {
    return this.current.get(key) ?? this.previous.get(key);
  }
  /**
   * Method to increment a client's hit counter.
   *
   * @param key {string} - The identifier for a client.
   *
   * @returns {ClientRateLimitInfo} - The number of hits and reset time for that client.
   *
   * @public
   */
  async increment(key) {
    const client = this.getClient(key);
    const now = Date.now();
    if (client.resetTime.getTime() <= now) {
      this.resetClient(client, now);
    }
    client.totalHits++;
    return client;
  }
  /**
   * Method to decrement a client's hit counter.
   *
   * @param key {string} - The identifier for a client.
   *
   * @public
   */
  async decrement(key) {
    const client = this.getClient(key);
    if (client.totalHits > 0) client.totalHits--;
  }
  /**
   * Method to reset a client's hit counter.
   *
   * @param key {string} - The identifier for a client.
   *
   * @public
   */
  async resetKey(key) {
    this.current.delete(key);
    this.previous.delete(key);
  }
  /**
   * Method to reset everyone's hit counter.
   *
   * @public
   */
  async resetAll() {
    this.current.clear();
    this.previous.clear();
  }
  /**
   * Method to stop the timer (if currently running) and prevent any memory
   * leaks.
   *
   * @public
   */
  shutdown() {
    clearInterval(this.interval);
    void this.resetAll();
  }
  /**
   * Recycles a client by setting its hit count to zero, and reset time to
   * `windowMs` milliseconds from now.
   *
   * NOT to be confused with `#resetKey()`, which removes a client from both the
   * `current` and `previous` maps.
   *
   * @param client {Client} - The client to recycle.
   * @param now {number} - The current time, to which the `windowMs` is added to get the `resetTime` for the client.
   *
   * @return {Client} - The modified client that was passed in, to allow for chaining.
   */
  resetClient(client, now = Date.now()) {
    client.totalHits = 0;
    client.resetTime.setTime(now + this.windowMs);
    return client;
  }
  /**
   * Retrieves or creates a client, given a key. Also ensures that the client being
   * returned is in the `current` map.
   *
   * @param key {string} - The key under which the client is (or is to be) stored.
   *
   * @returns {Client} - The requested client.
   */
  getClient(key) {
    if (this.current.has(key)) return this.current.get(key);
    let client;
    if (this.previous.has(key)) {
      client = this.previous.get(key);
      this.previous.delete(key);
    } else {
      client = { totalHits: 0, resetTime: /* @__PURE__ */ new Date() };
      this.resetClient(client);
    }
    this.current.set(key, client);
    return client;
  }
  /**
   * Move current clients to previous, create a new map for current.
   *
   * This function is called every `windowMs`.
   */
  clearExpired() {
    this.previous = this.current;
    this.current = /* @__PURE__ */ new Map();
  }
};
var SUPPORTED_DRAFT_VERSIONS = [
  "draft-6",
  "draft-7",
  "draft-8"
];
var getResetSeconds = (windowMs, resetTime) => {
  let resetSeconds;
  if (resetTime) {
    const deltaSeconds = Math.ceil((resetTime.getTime() - Date.now()) / 1e3);
    resetSeconds = Math.max(0, deltaSeconds);
  } else {
    resetSeconds = Math.ceil(windowMs / 1e3);
  }
  return resetSeconds;
};
var getPartitionKey = (key) => {
  const hash = createHash("sha256");
  hash.update(key);
  const partitionKey = hash.digest("hex").slice(0, 12);
  return Buffer2.from(partitionKey).toString("base64");
};
var setLegacyHeaders = (response, info) => {
  if (response.headersSent) return;
  response.setHeader("X-RateLimit-Limit", info.limit.toString());
  response.setHeader("X-RateLimit-Remaining", info.remaining.toString());
  if (info.resetTime instanceof Date) {
    response.setHeader("Date", (/* @__PURE__ */ new Date()).toUTCString());
    response.setHeader(
      "X-RateLimit-Reset",
      Math.ceil(info.resetTime.getTime() / 1e3).toString()
    );
  }
};
var setDraft6Headers = (response, info, windowMs) => {
  if (response.headersSent) return;
  const windowSeconds = Math.ceil(windowMs / 1e3);
  const resetSeconds = getResetSeconds(windowMs, info.resetTime);
  response.setHeader("RateLimit-Policy", `${info.limit};w=${windowSeconds}`);
  response.setHeader("RateLimit-Limit", info.limit.toString());
  response.setHeader("RateLimit-Remaining", info.remaining.toString());
  if (typeof resetSeconds === "number")
    response.setHeader("RateLimit-Reset", resetSeconds.toString());
};
var setDraft7Headers = (response, info, windowMs) => {
  if (response.headersSent) return;
  const windowSeconds = Math.ceil(windowMs / 1e3);
  const resetSeconds = getResetSeconds(windowMs, info.resetTime);
  response.setHeader("RateLimit-Policy", `${info.limit};w=${windowSeconds}`);
  response.setHeader(
    "RateLimit",
    `limit=${info.limit}, remaining=${info.remaining}, reset=${resetSeconds}`
  );
};
var setDraft8Headers = (response, info, windowMs, name, key) => {
  if (response.headersSent) return;
  const windowSeconds = Math.ceil(windowMs / 1e3);
  const resetSeconds = getResetSeconds(windowMs, info.resetTime);
  const partitionKey = getPartitionKey(key);
  const header = `r=${info.remaining}; t=${resetSeconds}`;
  const policy = `q=${info.limit}; w=${windowSeconds}; pk=:${partitionKey}:`;
  response.append("RateLimit", `"${name}"; ${header}`);
  response.append("RateLimit-Policy", `"${name}"; ${policy}`);
};
var setRetryAfterHeader = (response, info, windowMs) => {
  if (response.headersSent) return;
  const resetSeconds = getResetSeconds(windowMs, info.resetTime);
  response.setHeader("Retry-After", resetSeconds.toString());
};
var omitUndefinedProperties = (passedOptions) => {
  const omittedOptions = {};
  for (const k of Object.keys(passedOptions)) {
    const key = k;
    if (passedOptions[key] !== void 0) {
      omittedOptions[key] = passedOptions[key];
    }
  }
  return omittedOptions;
};
var ValidationError = class extends Error {
  /**
   * The code must be a string, in snake case and all capital, that starts with
   * the substring `ERR_ERL_`.
   *
   * The message must be a string, starting with an uppercase character,
   * describing the issue in detail.
   */
  constructor(code, message) {
    const url = `https://express-rate-limit.github.io/${code}/`;
    super(`${message} See ${url} for more information.`);
    this.name = this.constructor.name;
    this.code = code;
    this.help = url;
  }
};
var ChangeWarning = class extends ValidationError {
};
var usedStores = /* @__PURE__ */ new Set();
var singleCountKeys = /* @__PURE__ */ new WeakMap();
var validations = {
  enabled: {
    default: true
  },
  // Should be EnabledValidations type, but that's a circular reference
  disable() {
    for (const k of Object.keys(this.enabled)) this.enabled[k] = false;
  },
  /**
   * Checks whether the IP address is valid, and that it does not have a port
   * number in it.
   *
   * See https://github.com/express-rate-limit/express-rate-limit/wiki/Error-Codes#err_erl_invalid_ip_address.
   *
   * @param ip {string | undefined} - The IP address provided by Express as request.ip.
   *
   * @returns {void}
   */
  ip(ip) {
    if (ip === void 0) {
      throw new ValidationError(
        "ERR_ERL_UNDEFINED_IP_ADDRESS",
        `An undefined 'request.ip' was detected. This might indicate a misconfiguration or the connection being destroyed prematurely.`
      );
    }
    if (!isIP(ip)) {
      throw new ValidationError(
        "ERR_ERL_INVALID_IP_ADDRESS",
        `An invalid 'request.ip' (${ip}) was detected. Consider passing a custom 'keyGenerator' function to the rate limiter.`
      );
    }
  },
  /**
   * Makes sure the trust proxy setting is not set to `true`.
   *
   * See https://github.com/express-rate-limit/express-rate-limit/wiki/Error-Codes#err_erl_permissive_trust_proxy.
   *
   * @param request {Request} - The Express request object.
   *
   * @returns {void}
   */
  trustProxy(request) {
    if (request.app.get("trust proxy") === true) {
      throw new ValidationError(
        "ERR_ERL_PERMISSIVE_TRUST_PROXY",
        `The Express 'trust proxy' setting is true, which allows anyone to trivially bypass IP-based rate limiting.`
      );
    }
  },
  /**
   * Makes sure the trust proxy setting is set in case the `X-Forwarded-For`
   * header is present.
   *
   * See https://github.com/express-rate-limit/express-rate-limit/wiki/Error-Codes#err_erl_unset_trust_proxy.
   *
   * @param request {Request} - The Express request object.
   *
   * @returns {void}
   */
  xForwardedForHeader(request) {
    if (request.headers["x-forwarded-for"] && request.app.get("trust proxy") === false) {
      throw new ValidationError(
        "ERR_ERL_UNEXPECTED_X_FORWARDED_FOR",
        `The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false (default). This could indicate a misconfiguration which would prevent express-rate-limit from accurately identifying users.`
      );
    }
  },
  /**
   * Alert the user if the Forwarded header is set (standardized version of X-Forwarded-For - not supported by express as of version 5.1.0)
   *
   * @param request {Request} - The Express request object.
   *
   * @returns {void}
   */
  forwardedHeader(request) {
    if (request.headers.forwarded && request.ip === request.socket?.remoteAddress) {
      throw new ValidationError(
        "ERR_ERL_FORWARDED_HEADER",
        `The 'Forwarded' header (standardized X-Forwarded-For) is set but currently being ignored. Add a custom keyGenerator to use a value from this header.`
      );
    }
  },
  /**
   * Ensures totalHits value from store is a positive integer.
   *
   * @param hits {any} - The `totalHits` returned by the store.
   */
  positiveHits(hits) {
    if (typeof hits !== "number" || hits < 1 || hits !== Math.round(hits)) {
      throw new ValidationError(
        "ERR_ERL_INVALID_HITS",
        `The totalHits value returned from the store must be a positive integer, got ${hits}`
      );
    }
  },
  /**
   * Ensures a single store instance is not used with multiple express-rate-limit instances
   */
  unsharedStore(store) {
    if (usedStores.has(store)) {
      const maybeUniquePrefix = store?.localKeys ? "" : " (with a unique prefix)";
      throw new ValidationError(
        "ERR_ERL_STORE_REUSE",
        `A Store instance must not be shared across multiple rate limiters. Create a new instance of ${store.constructor.name}${maybeUniquePrefix} for each limiter instead.`
      );
    }
    usedStores.add(store);
  },
  /**
   * Ensures a given key is incremented only once per request.
   *
   * @param request {Request} - The Express request object.
   * @param store {Store} - The store class.
   * @param key {string} - The key used to store the client's hit count.
   *
   * @returns {void}
   */
  singleCount(request, store, key) {
    let storeKeys = singleCountKeys.get(request);
    if (!storeKeys) {
      storeKeys = /* @__PURE__ */ new Map();
      singleCountKeys.set(request, storeKeys);
    }
    const storeKey = store.localKeys ? store : store.constructor.name;
    let keys = storeKeys.get(storeKey);
    if (!keys) {
      keys = [];
      storeKeys.set(storeKey, keys);
    }
    const prefixedKey = `${store.prefix ?? ""}${key}`;
    if (keys.includes(prefixedKey)) {
      throw new ValidationError(
        "ERR_ERL_DOUBLE_COUNT",
        `The hit count for ${key} was incremented more than once for a single request.`
      );
    }
    keys.push(prefixedKey);
  },
  /**
   * Warns the user that the behaviour for `max: 0` / `limit: 0` is
   * changing in the next major release.
   *
   * @param limit {number} - The maximum number of hits per client.
   *
   * @returns {void}
   */
  limit(limit) {
    if (limit === 0) {
      throw new ChangeWarning(
        "WRN_ERL_MAX_ZERO",
        "Setting limit or max to 0 disables rate limiting in express-rate-limit v6 and older, but will cause all requests to be blocked in v7"
      );
    }
  },
  /**
   * Warns the user that the `draft_polli_ratelimit_headers` option is deprecated
   * and will be removed in the next major release.
   *
   * @param draft_polli_ratelimit_headers {any | undefined} - The now-deprecated setting that was used to enable standard headers.
   *
   * @returns {void}
   */
  draftPolliHeaders(draft_polli_ratelimit_headers) {
    if (draft_polli_ratelimit_headers) {
      throw new ChangeWarning(
        "WRN_ERL_DEPRECATED_DRAFT_POLLI_HEADERS",
        `The draft_polli_ratelimit_headers configuration option is deprecated and has been removed in express-rate-limit v7, please set standardHeaders: 'draft-6' instead.`
      );
    }
  },
  /**
   * Warns the user that the `onLimitReached` option is deprecated and
   * will be removed in the next major release.
   *
   * @param onLimitReached {any | undefined} - The maximum number of hits per client.
   *
   * @returns {void}
   */
  onLimitReached(onLimitReached) {
    if (onLimitReached) {
      throw new ChangeWarning(
        "WRN_ERL_DEPRECATED_ON_LIMIT_REACHED",
        "The onLimitReached configuration option is deprecated and has been removed in express-rate-limit v7."
      );
    }
  },
  /**
   * Warns the user when an invalid/unsupported version of the draft spec is passed.
   *
   * @param version {any | undefined} - The version passed by the user.
   *
   * @returns {void}
   */
  headersDraftVersion(version) {
    if (typeof version !== "string" || // @ts-expect-error This is fine. If version is not in the array, it will just return false.
    !SUPPORTED_DRAFT_VERSIONS.includes(version)) {
      const versionString = SUPPORTED_DRAFT_VERSIONS.join(", ");
      throw new ValidationError(
        "ERR_ERL_HEADERS_UNSUPPORTED_DRAFT_VERSION",
        `standardHeaders: only the following versions of the IETF draft specification are supported: ${versionString}.`
      );
    }
  },
  /**
   * Warns the user when the selected headers option requires a reset time but
   * the store does not provide one.
   *
   * @param resetTime {Date | undefined} - The timestamp when the client's hit count will be reset.
   *
   * @returns {void}
   */
  headersResetTime(resetTime) {
    if (!resetTime) {
      throw new ValidationError(
        "ERR_ERL_HEADERS_NO_RESET",
        `standardHeaders:  'draft-7' requires a 'resetTime', but the store did not provide one. The 'windowMs' value will be used instead, which may cause clients to wait longer than necessary.`
      );
    }
  },
  knownOptions(passedOptions) {
    if (!passedOptions) return;
    const optionsMap = {
      windowMs: true,
      limit: true,
      message: true,
      statusCode: true,
      legacyHeaders: true,
      standardHeaders: true,
      identifier: true,
      requestPropertyName: true,
      skipFailedRequests: true,
      skipSuccessfulRequests: true,
      keyGenerator: true,
      ipv6Subnet: true,
      handler: true,
      skip: true,
      requestWasSuccessful: true,
      store: true,
      validate: true,
      headers: true,
      max: true,
      passOnStoreError: true
    };
    const validOptions = Object.keys(optionsMap).concat(
      "draft_polli_ratelimit_headers",
      // not a valid option anymore, but we have a more specific check for this one, so don't warn for it here
      // from express-slow-down - https://github.com/express-rate-limit/express-slow-down/blob/main/source/types.ts#L65
      "delayAfter",
      "delayMs",
      "maxDelayMs"
    );
    for (const key of Object.keys(passedOptions)) {
      if (!validOptions.includes(key)) {
        throw new ValidationError(
          "ERR_ERL_UNKNOWN_OPTION",
          `Unexpected configuration option: ${key}`
          // todo: suggest a valid option with a short levenstein distance?
        );
      }
    }
  },
  /**
   * Checks the options.validate setting to ensure that only recognized
   * validations are enabled or disabled.
   *
   * If any unrecognized values are found, an error is logged that
   * includes the list of supported validations.
   */
  validationsConfig() {
    const supportedValidations = Object.keys(this).filter(
      (k) => !["enabled", "disable"].includes(k)
    );
    supportedValidations.push("default");
    for (const key of Object.keys(this.enabled)) {
      if (!supportedValidations.includes(key)) {
        throw new ValidationError(
          "ERR_ERL_UNKNOWN_VALIDATION",
          `options.validate.${key} is not recognized. Supported validate options are: ${supportedValidations.join(
            ", "
          )}.`
        );
      }
    }
  },
  /**
   * Checks to see if the instance was created inside of a request handler,
   * which would prevent it from working correctly, with the default memory
   * store (or any other store with localKeys.)
   */
  creationStack(store) {
    const { stack } = new Error(
      "express-rate-limit validation check (set options.validate.creationStack=false to disable)"
    );
    if (stack?.includes("Layer.handle [as handle_request]") || // express v4
    stack?.includes("Layer.handleRequest")) {
      if (!store.localKeys) {
        throw new ValidationError(
          "ERR_ERL_CREATED_IN_REQUEST_HANDLER",
          "express-rate-limit instance should *usually* be created at app initialization, not when responding to a request."
        );
      }
      throw new ValidationError(
        "ERR_ERL_CREATED_IN_REQUEST_HANDLER",
        "express-rate-limit instance should be created at app initialization, not when responding to a request."
      );
    }
  },
  ipv6Subnet(ipv6Subnet) {
    if (ipv6Subnet === false) {
      return;
    }
    if (!Number.isInteger(ipv6Subnet) || ipv6Subnet < 32 || ipv6Subnet > 64) {
      throw new ValidationError(
        "ERR_ERL_IPV6_SUBNET",
        `Unexpected ipv6Subnet value: ${ipv6Subnet}. Expected an integer between 32 and 64 (usually 48-64).`
      );
    }
  },
  ipv6SubnetOrKeyGenerator(options) {
    if (options.ipv6Subnet !== void 0 && options.keyGenerator) {
      throw new ValidationError(
        "ERR_ERL_IPV6SUBNET_OR_KEYGENERATOR",
        `Incompatible options: the 'ipv6Subnet' option is ignored when a custom 'keyGenerator' function is also set.`
      );
    }
  },
  keyGeneratorIpFallback(keyGenerator) {
    if (!keyGenerator) {
      return;
    }
    const src = keyGenerator.toString();
    if ((src.includes("req.ip") || src.includes("request.ip")) && !src.includes("ipKeyGenerator")) {
      throw new ValidationError(
        "ERR_ERL_KEY_GEN_IPV6",
        "Custom keyGenerator appears to use request IP without calling the ipKeyGenerator helper function for IPv6 addresses. This could allow IPv6 users to bypass limits."
      );
    }
  },
  /**
   * Checks to see if the window duration is greater than 2^32 - 1. This is only
   * called by the default MemoryStore, since it uses Node's setInterval method.
   *
   * See https://nodejs.org/api/timers.html#setintervalcallback-delay-args.
   */
  windowMs(windowMs) {
    const SET_TIMEOUT_MAX = 2 ** 31 - 1;
    if (typeof windowMs !== "number" || Number.isNaN(windowMs) || windowMs < 1 || windowMs > SET_TIMEOUT_MAX) {
      throw new ValidationError(
        "ERR_ERL_WINDOW_MS",
        `Invalid windowMs value: ${windowMs}${typeof windowMs !== "number" ? ` (${typeof windowMs})` : ""}, must be a number between 1 and ${SET_TIMEOUT_MAX} when using the default MemoryStore`
      );
    }
  }
};
var getValidations = (_enabled) => {
  let enabled;
  if (typeof _enabled === "boolean") {
    enabled = {
      default: _enabled
    };
  } else {
    enabled = {
      default: true,
      ..._enabled
    };
  }
  const wrappedValidations = { enabled };
  for (const [name, validation] of Object.entries(validations)) {
    if (typeof validation === "function")
      wrappedValidations[name] = (...args) => {
        if (!(enabled[name] ?? enabled.default)) {
          return;
        }
        try {
          ;
          validation.apply(
            wrappedValidations,
            args
          );
        } catch (error) {
          if (error instanceof ChangeWarning) console.warn(error);
          else console.error(error);
        }
      };
  }
  return wrappedValidations;
};
var isLegacyStore = (store) => (
  // Check that `incr` exists but `increment` does not - store authors might want
  // to keep both around for backwards compatibility.
  typeof store.incr === "function" && typeof store.increment !== "function"
);
var promisifyStore = (passedStore) => {
  if (!isLegacyStore(passedStore)) {
    return passedStore;
  }
  const legacyStore = passedStore;
  class PromisifiedStore {
    async increment(key) {
      return new Promise((resolve, reject) => {
        legacyStore.incr(
          key,
          (error, totalHits, resetTime) => {
            if (error) reject(error);
            resolve({ totalHits, resetTime });
          }
        );
      });
    }
    async decrement(key) {
      return legacyStore.decrement(key);
    }
    async resetKey(key) {
      return legacyStore.resetKey(key);
    }
    /* istanbul ignore next */
    async resetAll() {
      if (typeof legacyStore.resetAll === "function")
        return legacyStore.resetAll();
    }
  }
  return new PromisifiedStore();
};
var getOptionsFromConfig = (config) => {
  const { validations: validations2, ...directlyPassableEntries } = config;
  return {
    ...directlyPassableEntries,
    validate: validations2.enabled
  };
};
var parseOptions = (passedOptions) => {
  const notUndefinedOptions = omitUndefinedProperties(passedOptions);
  const validations2 = getValidations(notUndefinedOptions?.validate ?? true);
  validations2.validationsConfig();
  validations2.knownOptions(passedOptions);
  validations2.draftPolliHeaders(
    // @ts-expect-error see the note above.
    notUndefinedOptions.draft_polli_ratelimit_headers
  );
  validations2.onLimitReached(notUndefinedOptions.onLimitReached);
  if (notUndefinedOptions.ipv6Subnet !== void 0 && typeof notUndefinedOptions.ipv6Subnet !== "function") {
    validations2.ipv6Subnet(notUndefinedOptions.ipv6Subnet);
  }
  validations2.keyGeneratorIpFallback(notUndefinedOptions.keyGenerator);
  validations2.ipv6SubnetOrKeyGenerator(notUndefinedOptions);
  let standardHeaders = notUndefinedOptions.standardHeaders ?? false;
  if (standardHeaders === true) standardHeaders = "draft-6";
  const config = {
    windowMs: 60 * 1e3,
    limit: passedOptions.max ?? 5,
    // `max` is deprecated, but support it anyways.
    message: "Too many requests, please try again later.",
    statusCode: 429,
    legacyHeaders: passedOptions.headers ?? true,
    identifier(request, _response) {
      let duration = "";
      const property = config.requestPropertyName;
      const { limit } = request[property];
      const seconds = config.windowMs / 1e3;
      const minutes = config.windowMs / (1e3 * 60);
      const hours = config.windowMs / (1e3 * 60 * 60);
      const days = config.windowMs / (1e3 * 60 * 60 * 24);
      if (seconds < 60) duration = `${seconds}sec`;
      else if (minutes < 60) duration = `${minutes}min`;
      else if (hours < 24) duration = `${hours}hr${hours > 1 ? "s" : ""}`;
      else duration = `${days}day${days > 1 ? "s" : ""}`;
      return `${limit}-in-${duration}`;
    },
    requestPropertyName: "rateLimit",
    skipFailedRequests: false,
    skipSuccessfulRequests: false,
    requestWasSuccessful: (_request, response) => response.statusCode < 400,
    skip: (_request, _response) => false,
    async keyGenerator(request, response) {
      validations2.ip(request.ip);
      validations2.trustProxy(request);
      validations2.xForwardedForHeader(request);
      validations2.forwardedHeader(request);
      const ip = request.ip;
      let subnet = 56;
      if (isIPv62(ip)) {
        subnet = typeof config.ipv6Subnet === "function" ? await config.ipv6Subnet(request, response) : config.ipv6Subnet;
        if (typeof config.ipv6Subnet === "function")
          validations2.ipv6Subnet(subnet);
      }
      return ipKeyGenerator(ip, subnet);
    },
    ipv6Subnet: 56,
    async handler(request, response, _next, _optionsUsed) {
      response.status(config.statusCode);
      const message = typeof config.message === "function" ? await config.message(
        request,
        response
      ) : config.message;
      if (!response.writableEnded) response.send(message);
    },
    passOnStoreError: false,
    // Allow the default options to be overridden by the passed options.
    ...notUndefinedOptions,
    // `standardHeaders` is resolved into a draft version above, use that.
    standardHeaders,
    // Note that this field is declared after the user's options are spread in,
    // so that this field doesn't get overridden with an un-promisified store!
    store: promisifyStore(
      notUndefinedOptions.store ?? new MemoryStore(validations2)
    ),
    // Print an error to the console if a few known misconfigurations are detected.
    validations: validations2
  };
  if (typeof config.store.increment !== "function" || typeof config.store.decrement !== "function" || typeof config.store.resetKey !== "function" || config.store.resetAll !== void 0 && typeof config.store.resetAll !== "function" || config.store.init !== void 0 && typeof config.store.init !== "function") {
    throw new TypeError(
      "An invalid store was passed. Please ensure that the store is a class that implements the `Store` interface."
    );
  }
  return config;
};
var handleAsyncErrors = (fn) => async (request, response, next) => {
  try {
    await Promise.resolve(fn(request, response, next)).catch(next);
  } catch (error) {
    next(error);
  }
};
var rateLimit = (passedOptions) => {
  const config = parseOptions(passedOptions ?? {});
  const options = getOptionsFromConfig(config);
  config.validations.creationStack(config.store);
  config.validations.unsharedStore(config.store);
  if (typeof config.store.init === "function") config.store.init(options);
  const middleware = handleAsyncErrors(
    async (request, response, next) => {
      const skip = await config.skip(request, response);
      if (skip) {
        next();
        return;
      }
      const augmentedRequest = request;
      const key = await config.keyGenerator(request, response);
      let totalHits = 0;
      let resetTime;
      try {
        const incrementResult = await config.store.increment(key);
        totalHits = incrementResult.totalHits;
        resetTime = incrementResult.resetTime;
      } catch (error) {
        if (config.passOnStoreError) {
          console.error(
            "express-rate-limit: error from store, allowing request without rate-limiting.",
            error
          );
          next();
          return;
        }
        throw error;
      }
      config.validations.positiveHits(totalHits);
      config.validations.singleCount(request, config.store, key);
      const retrieveLimit = typeof config.limit === "function" ? config.limit(request, response) : config.limit;
      const limit = await retrieveLimit;
      config.validations.limit(limit);
      const info = {
        limit,
        used: totalHits,
        remaining: Math.max(limit - totalHits, 0),
        resetTime,
        key
      };
      Object.defineProperty(info, "current", {
        configurable: false,
        enumerable: false,
        value: totalHits
      });
      augmentedRequest[config.requestPropertyName] = info;
      if (config.legacyHeaders && !response.headersSent) {
        setLegacyHeaders(response, info);
      }
      if (config.standardHeaders && !response.headersSent) {
        switch (config.standardHeaders) {
          case "draft-6": {
            setDraft6Headers(response, info, config.windowMs);
            break;
          }
          case "draft-7": {
            config.validations.headersResetTime(info.resetTime);
            setDraft7Headers(response, info, config.windowMs);
            break;
          }
          case "draft-8": {
            const retrieveName = typeof config.identifier === "function" ? config.identifier(request, response) : config.identifier;
            const name = await retrieveName;
            config.validations.headersResetTime(info.resetTime);
            setDraft8Headers(response, info, config.windowMs, name, key);
            break;
          }
          default: {
            config.validations.headersDraftVersion(config.standardHeaders);
            break;
          }
        }
      }
      if (config.skipFailedRequests || config.skipSuccessfulRequests) {
        let decremented = false;
        const decrementKey = async () => {
          if (!decremented) {
            await config.store.decrement(key);
            decremented = true;
          }
        };
        if (config.skipFailedRequests) {
          response.on("finish", async () => {
            if (!await config.requestWasSuccessful(request, response))
              await decrementKey();
          });
          response.on("close", async () => {
            if (!response.writableEnded) await decrementKey();
          });
          response.on("error", async () => {
            await decrementKey();
          });
        }
        if (config.skipSuccessfulRequests) {
          response.on("finish", async () => {
            if (await config.requestWasSuccessful(request, response))
              await decrementKey();
          });
        }
      }
      config.validations.disable();
      if (totalHits > limit) {
        if (config.legacyHeaders || config.standardHeaders) {
          setRetryAfterHeader(response, info, config.windowMs);
        }
        config.handler(request, response, next, options);
        return;
      }
      next();
    }
  );
  const getThrowFn = () => {
    throw new Error("The current store does not support the get/getKey method");
  };
  middleware.resetKey = config.store.resetKey.bind(config.store);
  middleware.getKey = typeof config.store.get === "function" ? config.store.get.bind(config.store) : getThrowFn;
  return middleware;
};
var rate_limit_default = rateLimit;

// src/services/worker-service.ts
import crypto from "crypto";
import { join as join3, dirname as dirname2 } from "path";
import { existsSync as existsSync4, mkdirSync as mkdirSync3, writeFileSync, unlinkSync, chmodSync } from "fs";
import { fileURLToPath as fileURLToPath2 } from "url";

// src/shims/bun-sqlite.ts
import BetterSqlite3 from "better-sqlite3";
var Database = class {
  _db;
  constructor(path, options) {
    this._db = new BetterSqlite3(path, {
      // better-sqlite3 crea il file di default (non serve 'create')
      readonly: options?.readwrite === false ? true : false
    });
  }
  /**
   * Esegui una query SQL senza risultati
   */
  run(sql, params) {
    const stmt = this._db.prepare(sql);
    const result = params ? stmt.run(...params) : stmt.run();
    return result;
  }
  /**
   * Prepara una query con interfaccia compatibile bun:sqlite
   */
  query(sql) {
    return new BunQueryCompat(this._db, sql);
  }
  /**
   * Crea una transazione
   */
  transaction(fn) {
    return this._db.transaction(fn);
  }
  /**
   * Chiudi la connessione
   */
  close() {
    this._db.close();
  }
};
var BunQueryCompat = class {
  _db;
  _sql;
  constructor(db2, sql) {
    this._db = db2;
    this._sql = sql;
  }
  /**
   * Restituisce tutte le righe
   */
  all(...params) {
    const stmt = this._db.prepare(this._sql);
    return params.length > 0 ? stmt.all(...params) : stmt.all();
  }
  /**
   * Restituisce la prima riga o null
   */
  get(...params) {
    const stmt = this._db.prepare(this._sql);
    return params.length > 0 ? stmt.get(...params) : stmt.get();
  }
  /**
   * Esegui senza risultati
   */
  run(...params) {
    const stmt = this._db.prepare(this._sql);
    return params.length > 0 ? stmt.run(...params) : stmt.run();
  }
};

// src/shared/paths.ts
import { join as join2, dirname, basename } from "path";
import { homedir as homedir2 } from "os";
import { existsSync as existsSync2, mkdirSync as mkdirSync2 } from "fs";
import { fileURLToPath } from "url";

// src/utils/logger.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["DEBUG"] = 0] = "DEBUG";
  LogLevel2[LogLevel2["INFO"] = 1] = "INFO";
  LogLevel2[LogLevel2["WARN"] = 2] = "WARN";
  LogLevel2[LogLevel2["ERROR"] = 3] = "ERROR";
  LogLevel2[LogLevel2["SILENT"] = 4] = "SILENT";
  return LogLevel2;
})(LogLevel || {});
var DEFAULT_DATA_DIR = join(homedir(), ".contextkit");
var Logger = class {
  level = null;
  useColor;
  logFilePath = null;
  logFileInitialized = false;
  constructor() {
    this.useColor = process.stdout.isTTY ?? false;
  }
  /**
   * Initialize log file path and ensure directory exists (lazy initialization)
   */
  ensureLogFileInitialized() {
    if (this.logFileInitialized) return;
    this.logFileInitialized = true;
    try {
      const logsDir = join(DEFAULT_DATA_DIR, "logs");
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
      }
      const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      this.logFilePath = join(logsDir, `kiro-memory-${date}.log`);
    } catch (error) {
      console.error("[LOGGER] Failed to initialize log file:", error);
      this.logFilePath = null;
    }
  }
  /**
   * Lazy-load log level from settings file
   */
  getLevel() {
    if (this.level === null) {
      try {
        const settingsPath = join(DEFAULT_DATA_DIR, "settings.json");
        if (existsSync(settingsPath)) {
          const settingsData = readFileSync(settingsPath, "utf-8");
          const settings = JSON.parse(settingsData);
          const envLevel = (settings.KIRO_MEMORY_LOG_LEVEL || settings.CONTEXTKIT_LOG_LEVEL || "INFO").toUpperCase();
          this.level = LogLevel[envLevel] ?? 1 /* INFO */;
        } else {
          this.level = 1 /* INFO */;
        }
      } catch (error) {
        this.level = 1 /* INFO */;
      }
    }
    return this.level;
  }
  /**
   * Create correlation ID for tracking an observation through the pipeline
   */
  correlationId(sessionId, observationNum) {
    return `obs-${sessionId}-${observationNum}`;
  }
  /**
   * Create session correlation ID
   */
  sessionId(sessionId) {
    return `session-${sessionId}`;
  }
  /**
   * Format data for logging - create compact summaries instead of full dumps
   */
  formatData(data) {
    if (data === null || data === void 0) return "";
    if (typeof data === "string") return data;
    if (typeof data === "number") return data.toString();
    if (typeof data === "boolean") return data.toString();
    if (typeof data === "object") {
      if (data instanceof Error) {
        return this.getLevel() === 0 /* DEBUG */ ? `${data.message}
${data.stack}` : data.message;
      }
      if (Array.isArray(data)) {
        return `[${data.length} items]`;
      }
      const keys = Object.keys(data);
      if (keys.length === 0) return "{}";
      if (keys.length <= 3) {
        return JSON.stringify(data);
      }
      return `{${keys.length} keys: ${keys.slice(0, 3).join(", ")}...}`;
    }
    return String(data);
  }
  /**
   * Format timestamp in local timezone (YYYY-MM-DD HH:MM:SS.mmm)
   */
  formatTimestamp(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
  }
  /**
   * Core logging method
   */
  log(level, component, message, context, data) {
    if (level < this.getLevel()) return;
    this.ensureLogFileInitialized();
    const timestamp = this.formatTimestamp(/* @__PURE__ */ new Date());
    const levelStr = LogLevel[level].padEnd(5);
    const componentStr = component.padEnd(6);
    let correlationStr = "";
    if (context?.correlationId) {
      correlationStr = `[${context.correlationId}] `;
    } else if (context?.sessionId) {
      correlationStr = `[session-${context.sessionId}] `;
    }
    let dataStr = "";
    if (data !== void 0 && data !== null) {
      if (data instanceof Error) {
        dataStr = this.getLevel() === 0 /* DEBUG */ ? `
${data.message}
${data.stack}` : ` ${data.message}`;
      } else if (this.getLevel() === 0 /* DEBUG */ && typeof data === "object") {
        dataStr = "\n" + JSON.stringify(data, null, 2);
      } else {
        dataStr = " " + this.formatData(data);
      }
    }
    let contextStr = "";
    if (context) {
      const { sessionId, memorySessionId, correlationId, ...rest } = context;
      if (Object.keys(rest).length > 0) {
        const pairs = Object.entries(rest).map(([k, v]) => `${k}=${v}`);
        contextStr = ` {${pairs.join(", ")}}`;
      }
    }
    const logLine = `[${timestamp}] [${levelStr}] [${componentStr}] ${correlationStr}${message}${contextStr}${dataStr}`;
    if (this.logFilePath) {
      try {
        appendFileSync(this.logFilePath, logLine + "\n", "utf8");
      } catch (error) {
        process.stderr.write(`[LOGGER] Failed to write to log file: ${error}
`);
      }
    } else {
      process.stderr.write(logLine + "\n");
    }
  }
  // Public logging methods
  debug(component, message, context, data) {
    this.log(0 /* DEBUG */, component, message, context, data);
  }
  info(component, message, context, data) {
    this.log(1 /* INFO */, component, message, context, data);
  }
  warn(component, message, context, data) {
    this.log(2 /* WARN */, component, message, context, data);
  }
  error(component, message, context, data) {
    this.log(3 /* ERROR */, component, message, context, data);
  }
  /**
   * Log data flow: input → processing
   */
  dataIn(component, message, context, data) {
    this.info(component, `\u2192 ${message}`, context, data);
  }
  /**
   * Log data flow: processing → output
   */
  dataOut(component, message, context, data) {
    this.info(component, `\u2190 ${message}`, context, data);
  }
  /**
   * Log successful completion
   */
  success(component, message, context, data) {
    this.info(component, `\u2713 ${message}`, context, data);
  }
  /**
   * Log failure
   */
  failure(component, message, context, data) {
    this.error(component, `\u2717 ${message}`, context, data);
  }
  /**
   * Log timing information
   */
  timing(component, message, durationMs, context) {
    this.info(component, `\u23F1 ${message}`, context, { duration: `${durationMs}ms` });
  }
  /**
   * Happy Path Error - logs when the expected "happy path" fails but we have a fallback
   */
  happyPathError(component, message, context, data, fallback = "") {
    const stack = new Error().stack || "";
    const stackLines = stack.split("\n");
    const callerLine = stackLines[2] || "";
    const callerMatch = callerLine.match(/at\s+(?:.*\s+)?\(?([^:]+):(\d+):(\d+)\)?/);
    const location = callerMatch ? `${callerMatch[1].split("/").pop()}:${callerMatch[2]}` : "unknown";
    const enhancedContext = {
      ...context,
      location
    };
    this.warn(component, `[HAPPY-PATH] ${message}`, enhancedContext, data);
    return fallback;
  }
};
var logger = new Logger();

// src/shared/paths.ts
function getDirname() {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }
  return dirname(fileURLToPath(import.meta.url));
}
var _dirname = getDirname();
var _legacyDir = join2(homedir2(), ".contextkit");
var _defaultDir = existsSync2(_legacyDir) ? _legacyDir : join2(homedir2(), ".kiro-memory");
var DATA_DIR = process.env.KIRO_MEMORY_DATA_DIR || process.env.CONTEXTKIT_DATA_DIR || _defaultDir;
var KIRO_CONFIG_DIR = process.env.KIRO_CONFIG_DIR || join2(homedir2(), ".kiro");
var PLUGIN_ROOT = join2(KIRO_CONFIG_DIR, "plugins", "kiro-memory");
var ARCHIVES_DIR = join2(DATA_DIR, "archives");
var LOGS_DIR = join2(DATA_DIR, "logs");
var TRASH_DIR = join2(DATA_DIR, "trash");
var BACKUPS_DIR = join2(DATA_DIR, "backups");
var MODES_DIR = join2(DATA_DIR, "modes");
var USER_SETTINGS_PATH = join2(DATA_DIR, "settings.json");
var _legacyDb = join2(DATA_DIR, "contextkit.db");
var DB_PATH = existsSync2(_legacyDb) ? _legacyDb : join2(DATA_DIR, "kiro-memory.db");
var VECTOR_DB_DIR = join2(DATA_DIR, "vector-db");
var OBSERVER_SESSIONS_DIR = join2(DATA_DIR, "observer-sessions");
var KIRO_SETTINGS_PATH = join2(KIRO_CONFIG_DIR, "settings.json");
var KIRO_CONTEXT_PATH = join2(KIRO_CONFIG_DIR, "context.md");
function ensureDir(dirPath) {
  mkdirSync2(dirPath, { recursive: true });
}

// src/services/sqlite/Database.ts
var SQLITE_MMAP_SIZE_BYTES = 256 * 1024 * 1024;
var SQLITE_CACHE_SIZE_PAGES = 1e4;
var KiroMemoryDatabase = class {
  db;
  /**
   * @param dbPath - Percorso al file SQLite (default: DB_PATH)
   * @param skipMigrations - Se true, salta il migration runner (per hook ad alta frequenza)
   */
  constructor(dbPath = DB_PATH, skipMigrations = false) {
    if (dbPath !== ":memory:") {
      ensureDir(DATA_DIR);
    }
    this.db = new Database(dbPath, { create: true, readwrite: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA synchronous = NORMAL");
    this.db.run("PRAGMA foreign_keys = ON");
    this.db.run("PRAGMA temp_store = memory");
    this.db.run(`PRAGMA mmap_size = ${SQLITE_MMAP_SIZE_BYTES}`);
    this.db.run(`PRAGMA cache_size = ${SQLITE_CACHE_SIZE_PAGES}`);
    if (!skipMigrations) {
      const migrationRunner = new MigrationRunner(this.db);
      migrationRunner.runAllMigrations();
    }
  }
  /**
   * Esegue una funzione all'interno di una transazione atomica.
   * Se fn() lancia un errore, la transazione viene annullata automaticamente.
   */
  withTransaction(fn) {
    const transaction = this.db.transaction(fn);
    return transaction(this.db);
  }
  /**
   * Close the database connection
   */
  close() {
    this.db.close();
  }
};
var MigrationRunner = class {
  db;
  constructor(db2) {
    this.db = db2;
  }
  runAllMigrations() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_versions (
        id INTEGER PRIMARY KEY,
        version INTEGER UNIQUE NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
    const versionQuery = this.db.query("SELECT MAX(version) as version FROM schema_versions");
    const result = versionQuery.get();
    const currentVersion = result?.version || 0;
    const migrations = this.getMigrations();
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        logger.info("DB", `Applying migration ${migration.version}`);
        const transaction = this.db.transaction(() => {
          migration.up(this.db);
          const insert = this.db.query("INSERT INTO schema_versions (version, applied_at) VALUES (?, ?)");
          insert.run(migration.version, (/* @__PURE__ */ new Date()).toISOString());
        });
        transaction();
        logger.info("DB", `Migration ${migration.version} applied successfully`);
      }
    }
  }
  getMigrations() {
    return [
      {
        version: 1,
        up: (db2) => {
          db2.run(`
            CREATE TABLE IF NOT EXISTS sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL UNIQUE,
              project TEXT NOT NULL,
              user_prompt TEXT NOT NULL,
              memory_session_id TEXT,
              status TEXT DEFAULT 'active',
              started_at TEXT NOT NULL,
              started_at_epoch INTEGER NOT NULL,
              completed_at TEXT,
              completed_at_epoch INTEGER
            )
          `);
          db2.run(`
            CREATE TABLE IF NOT EXISTS observations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memory_session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              type TEXT NOT NULL,
              title TEXT NOT NULL,
              subtitle TEXT,
              text TEXT,
              narrative TEXT,
              facts TEXT,
              concepts TEXT,
              files_read TEXT,
              files_modified TEXT,
              prompt_number INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);
          db2.run(`
            CREATE TABLE IF NOT EXISTS summaries (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              request TEXT,
              investigated TEXT,
              learned TEXT,
              completed TEXT,
              next_steps TEXT,
              notes TEXT,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);
          db2.run(`
            CREATE TABLE IF NOT EXISTS prompts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              prompt_number INTEGER NOT NULL,
              prompt_text TEXT NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);
          db2.run(`
            CREATE TABLE IF NOT EXISTS pending_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL,
              type TEXT NOT NULL,
              data TEXT NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);
          db2.run("CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project)");
          db2.run("CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project)");
          db2.run("CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(memory_session_id)");
          db2.run("CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id)");
          db2.run("CREATE INDEX IF NOT EXISTS idx_prompts_session ON prompts(content_session_id)");
        }
      },
      {
        version: 2,
        up: (db2) => {
          db2.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
              title, text, narrative, concepts,
              content='observations',
              content_rowid='id'
            )
          `);
          db2.run(`
            CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
              INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
              VALUES (new.id, new.title, new.text, new.narrative, new.concepts);
            END
          `);
          db2.run(`
            CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
              INSERT INTO observations_fts(observations_fts, rowid, title, text, narrative, concepts)
              VALUES ('delete', old.id, old.title, old.text, old.narrative, old.concepts);
            END
          `);
          db2.run(`
            CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
              INSERT INTO observations_fts(observations_fts, rowid, title, text, narrative, concepts)
              VALUES ('delete', old.id, old.title, old.text, old.narrative, old.concepts);
              INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
              VALUES (new.id, new.title, new.text, new.narrative, new.concepts);
            END
          `);
          db2.run(`
            INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
            SELECT id, title, text, narrative, concepts FROM observations
          `);
          db2.run("CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type)");
          db2.run("CREATE INDEX IF NOT EXISTS idx_observations_epoch ON observations(created_at_epoch)");
          db2.run("CREATE INDEX IF NOT EXISTS idx_summaries_project ON summaries(project)");
          db2.run("CREATE INDEX IF NOT EXISTS idx_summaries_epoch ON summaries(created_at_epoch)");
          db2.run("CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project)");
        }
      },
      {
        version: 3,
        up: (db2) => {
          db2.run(`
            CREATE TABLE IF NOT EXISTS project_aliases (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_name TEXT NOT NULL UNIQUE,
              display_name TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
          `);
          db2.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_project_aliases_name ON project_aliases(project_name)");
        }
      },
      {
        version: 4,
        up: (db2) => {
          db2.run(`
            CREATE TABLE IF NOT EXISTS observation_embeddings (
              observation_id INTEGER PRIMARY KEY,
              embedding BLOB NOT NULL,
              model TEXT NOT NULL,
              dimensions INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE
            )
          `);
          db2.run("CREATE INDEX IF NOT EXISTS idx_embeddings_model ON observation_embeddings(model)");
        }
      },
      {
        version: 5,
        up: (db2) => {
          db2.run("ALTER TABLE observations ADD COLUMN last_accessed_epoch INTEGER");
          db2.run("ALTER TABLE observations ADD COLUMN is_stale INTEGER DEFAULT 0");
          db2.run("CREATE INDEX IF NOT EXISTS idx_observations_last_accessed ON observations(last_accessed_epoch)");
          db2.run("CREATE INDEX IF NOT EXISTS idx_observations_stale ON observations(is_stale)");
        }
      },
      {
        version: 6,
        up: (db2) => {
          db2.run(`
            CREATE TABLE IF NOT EXISTS checkpoints (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id INTEGER NOT NULL,
              project TEXT NOT NULL,
              task TEXT NOT NULL,
              progress TEXT,
              next_steps TEXT,
              open_questions TEXT,
              relevant_files TEXT,
              context_snapshot TEXT,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL,
              FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
          `);
          db2.run("CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id)");
          db2.run("CREATE INDEX IF NOT EXISTS idx_checkpoints_project ON checkpoints(project)");
          db2.run("CREATE INDEX IF NOT EXISTS idx_checkpoints_epoch ON checkpoints(created_at_epoch)");
        }
      },
      {
        version: 7,
        up: (db2) => {
          db2.run("ALTER TABLE observations ADD COLUMN content_hash TEXT");
          db2.run("CREATE INDEX IF NOT EXISTS idx_observations_hash ON observations(content_hash)");
        }
      },
      {
        version: 8,
        up: (db2) => {
          db2.run("ALTER TABLE observations ADD COLUMN discovery_tokens INTEGER DEFAULT 0");
          db2.run("ALTER TABLE summaries ADD COLUMN discovery_tokens INTEGER DEFAULT 0");
        }
      },
      {
        version: 9,
        up: (db2) => {
          db2.run("CREATE INDEX IF NOT EXISTS idx_observations_project_epoch ON observations(project, created_at_epoch DESC)");
          db2.run("CREATE INDEX IF NOT EXISTS idx_observations_project_type ON observations(project, type)");
          db2.run("CREATE INDEX IF NOT EXISTS idx_summaries_project_epoch ON summaries(project, created_at_epoch DESC)");
          db2.run("CREATE INDEX IF NOT EXISTS idx_prompts_project_epoch ON prompts(project, created_at_epoch DESC)");
        }
      }
    ];
  }
};

// src/services/worker-service.ts
init_Observations();

// src/services/sqlite/Summaries.ts
function createSummary(db2, sessionId, project, request, investigated, learned, completed, nextSteps, notes) {
  const now = /* @__PURE__ */ new Date();
  const result = db2.run(
    `INSERT INTO summaries 
     (session_id, project, request, investigated, learned, completed, next_steps, notes, created_at, created_at_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, project, request, investigated, learned, completed, nextSteps, notes, now.toISOString(), now.getTime()]
  );
  return Number(result.lastInsertRowid);
}
function getSummariesByProject(db2, project, limit = 50) {
  const query = db2.query(
    "SELECT * FROM summaries WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ?"
  );
  return query.all(project, limit);
}

// src/services/worker-service.ts
init_Search();

// src/services/search/EmbeddingService.ts
var EmbeddingService = class {
  provider = null;
  model = null;
  initialized = false;
  initializing = null;
  /**
   * Inizializza il servizio di embedding.
   * Tenta fastembed, poi @huggingface/transformers, poi fallback a null.
   */
  async initialize() {
    if (this.initialized) return this.provider !== null;
    if (this.initializing) return this.initializing;
    this.initializing = this._doInitialize();
    const result = await this.initializing;
    this.initializing = null;
    return result;
  }
  async _doInitialize() {
    try {
      const fastembed = await import("fastembed");
      const EmbeddingModel = fastembed.EmbeddingModel || fastembed.default?.EmbeddingModel;
      const FlagEmbedding = fastembed.FlagEmbedding || fastembed.default?.FlagEmbedding;
      if (FlagEmbedding && EmbeddingModel) {
        this.model = await FlagEmbedding.init({
          model: EmbeddingModel.BGESmallENV15
        });
        this.provider = "fastembed";
        this.initialized = true;
        logger.info("EMBEDDING", "Inizializzato con fastembed (BGE-small-en-v1.5)");
        return true;
      }
    } catch (error) {
      logger.debug("EMBEDDING", `fastembed non disponibile: ${error}`);
    }
    try {
      const transformers = await import("@huggingface/transformers");
      const pipeline = transformers.pipeline || transformers.default?.pipeline;
      if (pipeline) {
        this.model = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
          quantized: true
        });
        this.provider = "transformers";
        this.initialized = true;
        logger.info("EMBEDDING", "Inizializzato con @huggingface/transformers (all-MiniLM-L6-v2)");
        return true;
      }
    } catch (error) {
      logger.debug("EMBEDDING", `@huggingface/transformers non disponibile: ${error}`);
    }
    this.provider = null;
    this.initialized = true;
    logger.warn("EMBEDDING", "Nessun provider embedding disponibile, ricerca semantica disabilitata");
    return false;
  }
  /**
   * Genera embedding per un singolo testo.
   * Ritorna Float32Array con 384 dimensioni, o null se non disponibile.
   */
  async embed(text) {
    if (!this.initialized) await this.initialize();
    if (!this.provider || !this.model) return null;
    try {
      const truncated = text.substring(0, 2e3);
      if (this.provider === "fastembed") {
        return await this._embedFastembed(truncated);
      } else if (this.provider === "transformers") {
        return await this._embedTransformers(truncated);
      }
    } catch (error) {
      logger.error("EMBEDDING", `Errore generazione embedding: ${error}`);
    }
    return null;
  }
  /**
   * Genera embeddings in batch.
   */
  async embedBatch(texts) {
    if (!this.initialized) await this.initialize();
    if (!this.provider || !this.model) return texts.map(() => null);
    const results = [];
    for (const text of texts) {
      try {
        const embedding = await this.embed(text);
        results.push(embedding);
      } catch {
        results.push(null);
      }
    }
    return results;
  }
  /**
   * Verifica se il servizio è disponibile.
   */
  isAvailable() {
    return this.initialized && this.provider !== null;
  }
  /**
   * Nome del provider attivo.
   */
  getProvider() {
    return this.provider;
  }
  /**
   * Dimensioni del vettore embedding.
   */
  getDimensions() {
    return 384;
  }
  // --- Provider specifici ---
  async _embedFastembed(text) {
    const embeddings = this.model.embed([text], 1);
    for await (const batch of embeddings) {
      if (batch && batch.length > 0) {
        const vec = batch[0];
        return vec instanceof Float32Array ? vec : new Float32Array(vec);
      }
    }
    return null;
  }
  async _embedTransformers(text) {
    const output = await this.model(text, {
      pooling: "mean",
      normalize: true
    });
    if (output?.data) {
      return output.data instanceof Float32Array ? output.data : new Float32Array(output.data);
    }
    return null;
  }
};
var embeddingService = null;
function getEmbeddingService() {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}

// src/services/search/VectorSearch.ts
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}
function float32ToBuffer(arr) {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}
function bufferToFloat32(buf) {
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Float32Array(arrayBuffer);
}
var VectorSearch = class {
  /**
   * Ricerca semantica: calcola cosine similarity tra query e tutti gli embeddings.
   */
  async search(db2, queryEmbedding, options = {}) {
    const limit = options.limit || 10;
    const threshold = options.threshold || 0.3;
    try {
      let sql = `
        SELECT e.observation_id, e.embedding,
               o.title, o.text, o.type, o.project, o.created_at, o.created_at_epoch
        FROM observation_embeddings e
        JOIN observations o ON o.id = e.observation_id
      `;
      const params = [];
      if (options.project) {
        sql += " WHERE o.project = ?";
        params.push(options.project);
      }
      const rows = db2.query(sql).all(...params);
      const scored = [];
      for (const row of rows) {
        const embedding = bufferToFloat32(row.embedding);
        const similarity = cosineSimilarity(queryEmbedding, embedding);
        if (similarity >= threshold) {
          scored.push({
            id: row.observation_id,
            observationId: row.observation_id,
            similarity,
            title: row.title,
            text: row.text,
            type: row.type,
            project: row.project,
            created_at: row.created_at,
            created_at_epoch: row.created_at_epoch
          });
        }
      }
      scored.sort((a, b) => b.similarity - a.similarity);
      return scored.slice(0, limit);
    } catch (error) {
      logger.error("VECTOR", `Errore ricerca vettoriale: ${error}`);
      return [];
    }
  }
  /**
   * Salva embedding per un'osservazione.
   */
  async storeEmbedding(db2, observationId, embedding, model) {
    try {
      const blob = float32ToBuffer(embedding);
      db2.query(`
        INSERT OR REPLACE INTO observation_embeddings
          (observation_id, embedding, model, dimensions, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        observationId,
        blob,
        model,
        embedding.length,
        (/* @__PURE__ */ new Date()).toISOString()
      );
      logger.debug("VECTOR", `Embedding salvato per osservazione ${observationId}`);
    } catch (error) {
      logger.error("VECTOR", `Errore salvataggio embedding: ${error}`);
    }
  }
  /**
   * Genera embeddings per osservazioni che non li hanno ancora.
   */
  async backfillEmbeddings(db2, batchSize = 50) {
    const embeddingService2 = getEmbeddingService();
    if (!await embeddingService2.initialize()) {
      logger.warn("VECTOR", "Embedding service non disponibile, backfill saltato");
      return 0;
    }
    const rows = db2.query(`
      SELECT o.id, o.title, o.text, o.narrative, o.concepts
      FROM observations o
      LEFT JOIN observation_embeddings e ON e.observation_id = o.id
      WHERE e.observation_id IS NULL
      ORDER BY o.created_at_epoch DESC
      LIMIT ?
    `).all(batchSize);
    if (rows.length === 0) return 0;
    let count = 0;
    const model = embeddingService2.getProvider() || "unknown";
    for (const row of rows) {
      const parts = [row.title];
      if (row.text) parts.push(row.text);
      if (row.narrative) parts.push(row.narrative);
      if (row.concepts) parts.push(row.concepts);
      const fullText = parts.join(" ").substring(0, 2e3);
      const embedding = await embeddingService2.embed(fullText);
      if (embedding) {
        await this.storeEmbedding(db2, row.id, embedding, model);
        count++;
      }
    }
    logger.info("VECTOR", `Backfill completato: ${count}/${rows.length} embeddings generati`);
    return count;
  }
  /**
   * Statistiche sugli embeddings.
   */
  getStats(db2) {
    try {
      const totalRow = db2.query("SELECT COUNT(*) as count FROM observations").get();
      const embeddedRow = db2.query("SELECT COUNT(*) as count FROM observation_embeddings").get();
      const total = totalRow?.count || 0;
      const embedded = embeddedRow?.count || 0;
      const percentage = total > 0 ? Math.round(embedded / total * 100) : 0;
      return { total, embedded, percentage };
    } catch {
      return { total: 0, embedded: 0, percentage: 0 };
    }
  }
};
var vectorSearch = null;
function getVectorSearch() {
  if (!vectorSearch) {
    vectorSearch = new VectorSearch();
  }
  return vectorSearch;
}

// src/services/search/ScoringEngine.ts
var SEARCH_WEIGHTS = {
  semantic: 0.4,
  fts5: 0.3,
  recency: 0.2,
  projectMatch: 0.1
};
function recencyScore(createdAtEpoch, halfLifeHours = 168) {
  if (!createdAtEpoch || createdAtEpoch <= 0) return 0;
  const nowMs = Date.now();
  const ageMs = nowMs - createdAtEpoch;
  if (ageMs <= 0) return 1;
  const ageHours = ageMs / (1e3 * 60 * 60);
  return Math.exp(-ageHours * Math.LN2 / halfLifeHours);
}
function normalizeFTS5Rank(rank, allRanks) {
  if (allRanks.length === 0) return 0;
  if (allRanks.length === 1) return 1;
  const minRank = Math.min(...allRanks);
  const maxRank = Math.max(...allRanks);
  if (minRank === maxRank) return 1;
  return (maxRank - rank) / (maxRank - minRank);
}
function projectMatchScore(itemProject, targetProject) {
  if (!itemProject || !targetProject) return 0;
  return itemProject.toLowerCase() === targetProject.toLowerCase() ? 1 : 0;
}
function computeCompositeScore(signals, weights) {
  return signals.semantic * weights.semantic + signals.fts5 * weights.fts5 + signals.recency * weights.recency + signals.projectMatch * weights.projectMatch;
}
var KNOWLEDGE_TYPE_BOOST = {
  constraint: 1.3,
  decision: 1.25,
  heuristic: 1.15,
  rejected: 1.1
};
function knowledgeTypeBoost(type) {
  return KNOWLEDGE_TYPE_BOOST[type] ?? 1;
}

// src/services/search/HybridSearch.ts
var HybridSearch = class {
  embeddingInitialized = false;
  /**
   * Inizializza il servizio di embedding (lazy, non bloccante)
   */
  async initialize() {
    try {
      const embeddingService2 = getEmbeddingService();
      await embeddingService2.initialize();
      this.embeddingInitialized = embeddingService2.isAvailable();
      logger.info("SEARCH", `HybridSearch inizializzato (embedding: ${this.embeddingInitialized ? "attivo" : "disattivato"})`);
    } catch (error) {
      logger.warn("SEARCH", "Inizializzazione embedding fallita, uso solo FTS5", {}, error);
      this.embeddingInitialized = false;
    }
  }
  /**
   * Ricerca ibrida con scoring a 4 segnali
   */
  async search(db2, query, options = {}) {
    const limit = options.limit || 10;
    const weights = options.weights || SEARCH_WEIGHTS;
    const targetProject = options.project || "";
    const rawItems = /* @__PURE__ */ new Map();
    if (this.embeddingInitialized) {
      try {
        const embeddingService2 = getEmbeddingService();
        const queryEmbedding = await embeddingService2.embed(query);
        if (queryEmbedding) {
          const vectorSearch2 = getVectorSearch();
          const vectorResults = await vectorSearch2.search(db2, queryEmbedding, {
            project: options.project,
            limit: limit * 2,
            // Prendiamo piu risultati per il ranking
            threshold: 0.3
          });
          for (const hit of vectorResults) {
            rawItems.set(String(hit.observationId), {
              id: String(hit.observationId),
              title: hit.title,
              content: hit.text || "",
              type: hit.type,
              project: hit.project,
              created_at: hit.created_at,
              created_at_epoch: hit.created_at_epoch,
              semanticScore: hit.similarity,
              fts5Rank: null,
              source: "vector"
            });
          }
          logger.debug("SEARCH", `Vector search: ${vectorResults.length} risultati`);
        }
      } catch (error) {
        logger.warn("SEARCH", "Ricerca vettoriale fallita, uso solo keyword", {}, error);
      }
    }
    try {
      const { searchObservationsFTSWithRank: searchObservationsFTSWithRank2 } = await Promise.resolve().then(() => (init_Search(), Search_exports));
      const keywordResults = searchObservationsFTSWithRank2(db2, query, {
        project: options.project,
        limit: limit * 2
      });
      for (const obs of keywordResults) {
        const id = String(obs.id);
        const existing = rawItems.get(id);
        if (existing) {
          existing.fts5Rank = obs.fts5_rank;
          existing.source = "vector";
        } else {
          rawItems.set(id, {
            id,
            title: obs.title,
            content: obs.text || obs.narrative || "",
            type: obs.type,
            project: obs.project,
            created_at: obs.created_at,
            created_at_epoch: obs.created_at_epoch,
            semanticScore: 0,
            fts5Rank: obs.fts5_rank,
            source: "keyword"
          });
        }
      }
      logger.debug("SEARCH", `Keyword search: ${keywordResults.length} risultati`);
    } catch (error) {
      logger.error("SEARCH", "Ricerca keyword fallita", {}, error);
    }
    if (rawItems.size === 0) return [];
    const allFTS5Ranks = Array.from(rawItems.values()).filter((item) => item.fts5Rank !== null).map((item) => item.fts5Rank);
    const scored = [];
    for (const item of rawItems.values()) {
      const signals = {
        semantic: item.semanticScore,
        fts5: item.fts5Rank !== null ? normalizeFTS5Rank(item.fts5Rank, allFTS5Ranks) : 0,
        recency: recencyScore(item.created_at_epoch),
        projectMatch: targetProject ? projectMatchScore(item.project, targetProject) : 0
      };
      const score = computeCompositeScore(signals, weights);
      const isHybrid = item.semanticScore > 0 && item.fts5Rank !== null;
      const hybridBoost = isHybrid ? 1.15 : 1;
      const finalScore = Math.min(1, score * hybridBoost * knowledgeTypeBoost(item.type));
      scored.push({
        id: item.id,
        title: item.title,
        content: item.content,
        type: item.type,
        project: item.project,
        created_at: item.created_at,
        created_at_epoch: item.created_at_epoch,
        score: finalScore,
        source: isHybrid ? "hybrid" : item.source,
        signals
      });
    }
    scored.sort((a, b) => b.score - a.score);
    const finalResults = scored.slice(0, limit);
    if (finalResults.length > 0) {
      try {
        const { updateLastAccessed: updateLastAccessed2 } = await Promise.resolve().then(() => (init_Observations(), Observations_exports));
        const ids = finalResults.map((r) => parseInt(r.id, 10)).filter((id) => id > 0);
        if (ids.length > 0) {
          updateLastAccessed2(db2, ids);
        }
      } catch {
      }
    }
    return finalResults;
  }
};
var hybridSearch = null;
function getHybridSearch() {
  if (!hybridSearch) {
    hybridSearch = new HybridSearch();
  }
  return hybridSearch;
}

// src/services/sqlite/Analytics.ts
function getObservationsTimeline(db2, project, days = 30) {
  const cutoffEpoch = Date.now() - days * 24 * 60 * 60 * 1e3;
  const sql = project ? `SELECT DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as day, COUNT(*) as count
       FROM observations
       WHERE project = ? AND created_at_epoch >= ?
       GROUP BY day
       ORDER BY day ASC` : `SELECT DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as day, COUNT(*) as count
       FROM observations
       WHERE created_at_epoch >= ?
       GROUP BY day
       ORDER BY day ASC`;
  const stmt = db2.query(sql);
  const rows = project ? stmt.all(project, cutoffEpoch) : stmt.all(cutoffEpoch);
  return rows;
}
function getTypeDistribution(db2, project) {
  const sql = project ? `SELECT type, COUNT(*) as count
       FROM observations
       WHERE project = ?
       GROUP BY type
       ORDER BY count DESC` : `SELECT type, COUNT(*) as count
       FROM observations
       GROUP BY type
       ORDER BY count DESC`;
  const stmt = db2.query(sql);
  const rows = project ? stmt.all(project) : stmt.all();
  return rows;
}
function getSessionStats(db2, project) {
  const totalSql = project ? "SELECT COUNT(*) as count FROM sessions WHERE project = ?" : "SELECT COUNT(*) as count FROM sessions";
  const totalStmt = db2.query(totalSql);
  const total = project ? totalStmt.get(project)?.count || 0 : totalStmt.get()?.count || 0;
  const completedSql = project ? `SELECT COUNT(*) as count FROM sessions WHERE project = ? AND status = 'completed'` : `SELECT COUNT(*) as count FROM sessions WHERE status = 'completed'`;
  const completedStmt = db2.query(completedSql);
  const completed = project ? completedStmt.get(project)?.count || 0 : completedStmt.get()?.count || 0;
  const avgSql = project ? `SELECT AVG((completed_at_epoch - started_at_epoch) / 1000.0 / 60.0) as avg_min
       FROM sessions
       WHERE project = ? AND status = 'completed' AND completed_at_epoch IS NOT NULL AND completed_at_epoch > started_at_epoch` : `SELECT AVG((completed_at_epoch - started_at_epoch) / 1000.0 / 60.0) as avg_min
       FROM sessions
       WHERE status = 'completed' AND completed_at_epoch IS NOT NULL AND completed_at_epoch > started_at_epoch`;
  const avgStmt = db2.query(avgSql);
  const avgRow = project ? avgStmt.get(project) : avgStmt.get();
  const avgDurationMinutes = Math.round((avgRow?.avg_min || 0) * 10) / 10;
  return { total, completed, avgDurationMinutes };
}
function getAnalyticsOverview(db2, project) {
  const now = Date.now();
  const todayStart = now - now % (24 * 60 * 60 * 1e3);
  const weekStart = now - 7 * 24 * 60 * 60 * 1e3;
  const countQuery = (table) => {
    const sql = project ? `SELECT COUNT(*) as count FROM ${table} WHERE project = ?` : `SELECT COUNT(*) as count FROM ${table}`;
    const stmt = db2.query(sql);
    return project ? stmt.get(project)?.count || 0 : stmt.get()?.count || 0;
  };
  const observations = countQuery("observations");
  const summaries = countQuery("summaries");
  const sessions = countQuery("sessions");
  const prompts = countQuery("prompts");
  const todaySql = project ? "SELECT COUNT(*) as count FROM observations WHERE project = ? AND created_at_epoch >= ?" : "SELECT COUNT(*) as count FROM observations WHERE created_at_epoch >= ?";
  const todayStmt = db2.query(todaySql);
  const observationsToday = project ? todayStmt.get(project, todayStart)?.count || 0 : todayStmt.get(todayStart)?.count || 0;
  const weekSql = project ? "SELECT COUNT(*) as count FROM observations WHERE project = ? AND created_at_epoch >= ?" : "SELECT COUNT(*) as count FROM observations WHERE created_at_epoch >= ?";
  const weekStmt = db2.query(weekSql);
  const observationsThisWeek = project ? weekStmt.get(project, weekStart)?.count || 0 : weekStmt.get(weekStart)?.count || 0;
  const staleSql = project ? "SELECT COUNT(*) as count FROM observations WHERE project = ? AND is_stale = 1" : "SELECT COUNT(*) as count FROM observations WHERE is_stale = 1";
  const staleStmt = db2.query(staleSql);
  const staleCount = project ? staleStmt.get(project)?.count || 0 : staleStmt.get()?.count || 0;
  const knowledgeSql = project ? `SELECT COUNT(*) as count FROM observations WHERE project = ? AND type IN ('constraint', 'decision', 'heuristic', 'rejected')` : `SELECT COUNT(*) as count FROM observations WHERE type IN ('constraint', 'decision', 'heuristic', 'rejected')`;
  const knowledgeStmt = db2.query(knowledgeSql);
  const knowledgeCount = project ? knowledgeStmt.get(project)?.count || 0 : knowledgeStmt.get()?.count || 0;
  const discoverySql = project ? "SELECT COALESCE(SUM(discovery_tokens), 0) as total FROM observations WHERE project = ?" : "SELECT COALESCE(SUM(discovery_tokens), 0) as total FROM observations";
  const discoveryStmt = db2.query(discoverySql);
  const discoveryTokens = project ? discoveryStmt.get(project)?.total || 0 : discoveryStmt.get()?.total || 0;
  const readSql = project ? `SELECT COALESCE(SUM(CAST((LENGTH(COALESCE(title, '')) + LENGTH(COALESCE(narrative, ''))) / 4 AS INTEGER)), 0) as total FROM observations WHERE project = ?` : `SELECT COALESCE(SUM(CAST((LENGTH(COALESCE(title, '')) + LENGTH(COALESCE(narrative, ''))) / 4 AS INTEGER)), 0) as total FROM observations`;
  const readStmt = db2.query(readSql);
  const readTokens = project ? readStmt.get(project)?.total || 0 : readStmt.get()?.total || 0;
  const savings = Math.max(0, discoveryTokens - readTokens);
  const reductionPct = discoveryTokens > 0 ? Math.round((1 - readTokens / discoveryTokens) * 100) : 0;
  return {
    observations,
    summaries,
    sessions,
    prompts,
    observationsToday,
    observationsThisWeek,
    staleCount,
    knowledgeCount,
    tokenEconomics: { discoveryTokens, readTokens, savings, reductionPct }
  };
}

// src/services/sqlite/Checkpoints.ts
function getLatestCheckpoint(db2, sessionId) {
  const query = db2.query(
    "SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at_epoch DESC LIMIT 1"
  );
  return query.get(sessionId);
}
function getLatestCheckpointByProject(db2, project) {
  const query = db2.query(
    "SELECT * FROM checkpoints WHERE project = ? ORDER BY created_at_epoch DESC LIMIT 1"
  );
  return query.get(project);
}

// src/services/sqlite/Sessions.ts
function getActiveSessions(db2) {
  const query = db2.query("SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at_epoch DESC");
  return query.all();
}
function getSessionsByProject(db2, project, limit = 100) {
  const query = db2.query("SELECT * FROM sessions WHERE project = ? ORDER BY started_at_epoch DESC LIMIT ?");
  return query.all(project, limit);
}

// src/services/sqlite/Reports.ts
function getReportData(db2, project, startEpoch, endEpoch) {
  const startDate = new Date(startEpoch);
  const endDate = new Date(endEpoch);
  const days = Math.ceil((endEpoch - startEpoch) / (24 * 60 * 60 * 1e3));
  const label = days <= 7 ? "Weekly" : days <= 31 ? "Monthly" : "Custom";
  const countInRange = (table, epochCol = "created_at_epoch") => {
    const sql = project ? `SELECT COUNT(*) as count FROM ${table} WHERE project = ? AND ${epochCol} >= ? AND ${epochCol} <= ?` : `SELECT COUNT(*) as count FROM ${table} WHERE ${epochCol} >= ? AND ${epochCol} <= ?`;
    const stmt = db2.query(sql);
    const row = project ? stmt.get(project, startEpoch, endEpoch) : stmt.get(startEpoch, endEpoch);
    return row?.count || 0;
  };
  const observations = countInRange("observations");
  const summaries = countInRange("summaries");
  const prompts = countInRange("prompts");
  const sessions = countInRange("sessions", "started_at_epoch");
  const timelineSql = project ? `SELECT DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as day, COUNT(*) as count
       FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY day ORDER BY day ASC` : `SELECT DATE(datetime(created_at_epoch / 1000, 'unixepoch')) as day, COUNT(*) as count
       FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY day ORDER BY day ASC`;
  const timelineStmt = db2.query(timelineSql);
  const timeline = project ? timelineStmt.all(project, startEpoch, endEpoch) : timelineStmt.all(startEpoch, endEpoch);
  const typeSql = project ? `SELECT type, COUNT(*) as count FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY type ORDER BY count DESC` : `SELECT type, COUNT(*) as count FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       GROUP BY type ORDER BY count DESC`;
  const typeStmt = db2.query(typeSql);
  const typeDistribution = project ? typeStmt.all(project, startEpoch, endEpoch) : typeStmt.all(startEpoch, endEpoch);
  const sessionTotalSql = project ? `SELECT COUNT(*) as count FROM sessions WHERE project = ? AND started_at_epoch >= ? AND started_at_epoch <= ?` : `SELECT COUNT(*) as count FROM sessions WHERE started_at_epoch >= ? AND started_at_epoch <= ?`;
  const sessionTotal = (project ? db2.query(sessionTotalSql).get(project, startEpoch, endEpoch)?.count : db2.query(sessionTotalSql).get(startEpoch, endEpoch)?.count) || 0;
  const sessionCompletedSql = project ? `SELECT COUNT(*) as count FROM sessions WHERE project = ? AND started_at_epoch >= ? AND started_at_epoch <= ? AND status = 'completed'` : `SELECT COUNT(*) as count FROM sessions WHERE started_at_epoch >= ? AND started_at_epoch <= ? AND status = 'completed'`;
  const sessionCompleted = (project ? db2.query(sessionCompletedSql).get(project, startEpoch, endEpoch)?.count : db2.query(sessionCompletedSql).get(startEpoch, endEpoch)?.count) || 0;
  const sessionAvgSql = project ? `SELECT AVG((completed_at_epoch - started_at_epoch) / 1000.0 / 60.0) as avg_min
       FROM sessions
       WHERE project = ? AND started_at_epoch >= ? AND started_at_epoch <= ?
         AND status = 'completed' AND completed_at_epoch IS NOT NULL AND completed_at_epoch > started_at_epoch` : `SELECT AVG((completed_at_epoch - started_at_epoch) / 1000.0 / 60.0) as avg_min
       FROM sessions
       WHERE started_at_epoch >= ? AND started_at_epoch <= ?
         AND status = 'completed' AND completed_at_epoch IS NOT NULL AND completed_at_epoch > started_at_epoch`;
  const avgRow = project ? db2.query(sessionAvgSql).get(project, startEpoch, endEpoch) : db2.query(sessionAvgSql).get(startEpoch, endEpoch);
  const avgDurationMinutes = Math.round((avgRow?.avg_min || 0) * 10) / 10;
  const knowledgeSql = project ? `SELECT COUNT(*) as count FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
         AND type IN ('constraint', 'decision', 'heuristic', 'rejected')` : `SELECT COUNT(*) as count FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
         AND type IN ('constraint', 'decision', 'heuristic', 'rejected')`;
  const knowledgeCount = (project ? db2.query(knowledgeSql).get(project, startEpoch, endEpoch)?.count : db2.query(knowledgeSql).get(startEpoch, endEpoch)?.count) || 0;
  const staleSql = project ? `SELECT COUNT(*) as count FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ? AND is_stale = 1` : `SELECT COUNT(*) as count FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ? AND is_stale = 1`;
  const staleCount = (project ? db2.query(staleSql).get(project, startEpoch, endEpoch)?.count : db2.query(staleSql).get(startEpoch, endEpoch)?.count) || 0;
  const summarySql = project ? `SELECT learned, completed, next_steps FROM summaries
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
       ORDER BY created_at_epoch DESC` : `SELECT learned, completed, next_steps FROM summaries
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
       ORDER BY created_at_epoch DESC`;
  const summaryRows = project ? db2.query(summarySql).all(project, startEpoch, endEpoch) : db2.query(summarySql).all(startEpoch, endEpoch);
  const topLearnings = [];
  const completedTasks = [];
  const nextStepsArr = [];
  for (const row of summaryRows) {
    if (row.learned) {
      const parts = row.learned.split("; ").filter(Boolean);
      topLearnings.push(...parts);
    }
    if (row.completed) {
      const parts = row.completed.split("; ").filter(Boolean);
      completedTasks.push(...parts);
    }
    if (row.next_steps) {
      const parts = row.next_steps.split("; ").filter(Boolean);
      nextStepsArr.push(...parts);
    }
  }
  const filesSql = project ? `SELECT files_modified FROM observations
       WHERE project = ? AND created_at_epoch >= ? AND created_at_epoch <= ?
         AND files_modified IS NOT NULL AND files_modified != ''` : `SELECT files_modified FROM observations
       WHERE created_at_epoch >= ? AND created_at_epoch <= ?
         AND files_modified IS NOT NULL AND files_modified != ''`;
  const fileRows = project ? db2.query(filesSql).all(project, startEpoch, endEpoch) : db2.query(filesSql).all(startEpoch, endEpoch);
  const fileCounts = /* @__PURE__ */ new Map();
  for (const row of fileRows) {
    const files = row.files_modified.split(",").map((f) => f.trim()).filter(Boolean);
    for (const file of files) {
      fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
    }
  }
  const fileHotspots = Array.from(fileCounts.entries()).map(([file, count]) => ({ file, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  return {
    period: {
      start: startDate.toISOString().split("T")[0],
      end: endDate.toISOString().split("T")[0],
      days,
      label
    },
    overview: {
      observations,
      summaries,
      sessions,
      prompts,
      knowledgeCount,
      staleCount
    },
    timeline,
    typeDistribution,
    sessionStats: {
      total: sessionTotal,
      completed: sessionCompleted,
      avgDurationMinutes
    },
    topLearnings: [...new Set(topLearnings)].slice(0, 10),
    completedTasks: [...new Set(completedTasks)].slice(0, 10),
    nextSteps: [...new Set(nextStepsArr)].slice(0, 10),
    fileHotspots
  };
}

// src/services/report-formatter.ts
function formatReportMarkdown(data) {
  const lines = [];
  lines.push(`# Kiro Memory Report \u2014 ${data.period.label}`);
  lines.push("");
  lines.push(`**Period**: ${data.period.start} \u2192 ${data.period.end} (${data.period.days} days)`);
  lines.push("");
  lines.push("## Overview");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|--------|------:|");
  lines.push(`| Observations | ${data.overview.observations} |`);
  lines.push(`| Summaries | ${data.overview.summaries} |`);
  lines.push(`| Sessions | ${data.overview.sessions} |`);
  lines.push(`| Prompts | ${data.overview.prompts} |`);
  lines.push(`| Knowledge items | ${data.overview.knowledgeCount} |`);
  if (data.overview.staleCount > 0) {
    lines.push(`| Stale observations | ${data.overview.staleCount} |`);
  }
  lines.push("");
  if (data.sessionStats.total > 0) {
    const completionPct = Math.round(data.sessionStats.completed / data.sessionStats.total * 100);
    lines.push("## Sessions");
    lines.push("");
    lines.push(`- **Total**: ${data.sessionStats.total}`);
    lines.push(`- **Completed**: ${data.sessionStats.completed} (${completionPct}%)`);
    if (data.sessionStats.avgDurationMinutes > 0) {
      lines.push(`- **Avg duration**: ${data.sessionStats.avgDurationMinutes} min`);
    }
    lines.push("");
  }
  if (data.timeline.length > 0) {
    lines.push("## Activity Timeline");
    lines.push("");
    lines.push("| Date | Observations |");
    lines.push("|------|------------:|");
    for (const entry of data.timeline) {
      lines.push(`| ${entry.day} | ${entry.count} |`);
    }
    lines.push("");
  }
  if (data.typeDistribution.length > 0) {
    lines.push("## Observation Types");
    lines.push("");
    for (const entry of data.typeDistribution) {
      lines.push(`- **${entry.type}**: ${entry.count}`);
    }
    lines.push("");
  }
  if (data.topLearnings.length > 0) {
    lines.push("## Key Learnings");
    lines.push("");
    for (const learning of data.topLearnings) {
      lines.push(`- ${learning}`);
    }
    lines.push("");
  }
  if (data.completedTasks.length > 0) {
    lines.push("## Completed");
    lines.push("");
    for (const task of data.completedTasks) {
      lines.push(`- ${task}`);
    }
    lines.push("");
  }
  if (data.nextSteps.length > 0) {
    lines.push("## Next Steps");
    lines.push("");
    for (const step of data.nextSteps) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }
  if (data.fileHotspots.length > 0) {
    lines.push("## File Hotspots");
    lines.push("");
    lines.push("| File | Modifications |");
    lines.push("|------|-------------:|");
    for (const entry of data.fileHotspots.slice(0, 10)) {
      lines.push(`| \`${entry.file}\` | ${entry.count} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// src/types/worker-types.ts
var KNOWLEDGE_TYPES = ["constraint", "decision", "heuristic", "rejected"];

// src/services/worker-service.ts
var __worker_dirname = dirname2(fileURLToPath2(import.meta.url));
var PORT = process.env.KIRO_MEMORY_WORKER_PORT || process.env.CONTEXTKIT_WORKER_PORT || 3001;
var HOST = process.env.KIRO_MEMORY_WORKER_HOST || process.env.CONTEXTKIT_WORKER_HOST || "127.0.0.1";
var PID_FILE = join3(DATA_DIR, "worker.pid");
var TOKEN_FILE = join3(DATA_DIR, "worker.token");
var MAX_SSE_CLIENTS = 50;
if (!existsSync4(DATA_DIR)) {
  mkdirSync3(DATA_DIR, { recursive: true });
}
var WORKER_TOKEN = crypto.randomBytes(32).toString("hex");
writeFileSync(TOKEN_FILE, WORKER_TOKEN, "utf-8");
try {
  chmodSync(TOKEN_FILE, 384);
} catch (err) {
  if (process.platform !== "win32") {
    logger.warn("WORKER", `chmod 600 fallito su ${TOKEN_FILE}`, {}, err);
  }
}
var db = new KiroMemoryDatabase();
logger.info("WORKER", "Database initialized");
getHybridSearch().initialize().catch((err) => {
  logger.warn("WORKER", "Inizializzazione embedding fallita, ricerca solo FTS5", {}, err);
});
function parseIntSafe(value, defaultVal, min, max) {
  if (!value) return defaultVal;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min || parsed > max) return defaultVal;
  return parsed;
}
function isValidProject(project) {
  return typeof project === "string" && project.length > 0 && project.length <= 200 && /^[\w\-\.\/@ ]+$/.test(project) && !project.includes("..");
}
function isValidString(val, maxLen) {
  return typeof val === "string" && val.length <= maxLen;
}
var app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.tailwindcss.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["'none'"]
    }
  }
}));
app.use(cors({
  origin: [
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    `http://${HOST}:${PORT}`
  ],
  credentials: true,
  maxAge: 86400
}));
app.use(express.json({ limit: "1mb" }));
app.use("/api/", rate_limit_default({
  windowMs: 6e4,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, retry later" }
}));
var clients = [];
function broadcast(event, data) {
  const message = `event: ${event}
data: ${JSON.stringify(data)}

`;
  clients.forEach((client) => {
    try {
      client.write(message);
    } catch (err) {
      logger.warn("WORKER", "Failed to broadcast to client", {}, err);
    }
  });
}
var ALLOWED_EVENTS = /* @__PURE__ */ new Set(["observation-created", "summary-created", "prompt-created", "session-created"]);
var notifyLimiter = rate_limit_default({ windowMs: 6e4, max: 60, standardHeaders: true, legacyHeaders: false });
app.post("/api/notify", notifyLimiter, (req, res) => {
  const token = req.headers["x-worker-token"];
  if (token !== WORKER_TOKEN) {
    res.status(401).json({ error: "Invalid or missing X-Worker-Token" });
    return;
  }
  const { event, data } = req.body || {};
  if (!event || typeof event !== "string" || !ALLOWED_EVENTS.has(event)) {
    res.status(400).json({ error: `Event must be one of: ${[...ALLOWED_EVENTS].join(", ")}` });
    return;
  }
  broadcast(event, data || {});
  res.json({ ok: true });
});
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    version: "1.0.0"
  });
});
app.get("/events", (req, res) => {
  if (clients.length >= MAX_SSE_CLIENTS) {
    res.status(503).json({ error: "Too many SSE connections" });
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  clients.push(res);
  logger.info("WORKER", "SSE client connected", { clients: clients.length });
  res.write(`event: connected
data: ${JSON.stringify({ timestamp: Date.now() })}

`);
  const keepaliveInterval = setInterval(() => {
    try {
      res.write(`:keepalive ${Date.now()}

`);
    } catch {
      clearInterval(keepaliveInterval);
    }
  }, 15e3);
  req.on("close", () => {
    clearInterval(keepaliveInterval);
    const index = clients.indexOf(res);
    if (index > -1) {
      clients.splice(index, 1);
    }
    logger.info("WORKER", "SSE client disconnected", { clients: clients.length });
  });
});
app.get("/api/context/:project", (req, res) => {
  const { project } = req.params;
  if (!isValidProject(project)) {
    res.status(400).json({ error: "Invalid project name" });
    return;
  }
  try {
    const context = {
      project,
      observations: getObservationsByProject(db.db, project, 20),
      summaries: getSummariesByProject(db.db, project, 5)
    };
    res.json(context);
  } catch (error) {
    logger.error("WORKER", "Failed to get context", { project }, error);
    res.status(500).json({ error: "Failed to get context" });
  }
});
app.post("/api/observations", (req, res) => {
  const { memorySessionId, project, type, title, content, concepts, files } = req.body;
  if (!isValidProject(project)) {
    res.status(400).json({ error: 'Invalid or missing "project"' });
    return;
  }
  if (!isValidString(title, 500)) {
    res.status(400).json({ error: 'Invalid or missing "title" (max 500 chars)' });
    return;
  }
  if (content && !isValidString(content, 1e5)) {
    res.status(400).json({ error: '"content" too large (max 100KB)' });
    return;
  }
  if (concepts && !Array.isArray(concepts)) {
    res.status(400).json({ error: '"concepts" must be an array' });
    return;
  }
  if (files && !Array.isArray(files)) {
    res.status(400).json({ error: '"files" must be an array' });
    return;
  }
  try {
    const id = createObservation(
      db.db,
      memorySessionId || "api-" + Date.now(),
      project,
      type || "manual",
      title,
      null,
      content,
      null,
      null,
      concepts?.join(", ") || null,
      files?.join(", ") || null,
      null,
      0
    );
    broadcast("observation-created", { id, project, title });
    projectsCache.ts = 0;
    generateEmbeddingForObservation(id, title, content, concepts).catch(() => {
    });
    res.json({ id, success: true });
  } catch (error) {
    logger.error("WORKER", "Failed to store observation", {}, error);
    res.status(500).json({ error: "Failed to store observation" });
  }
});
app.post("/api/knowledge", (req, res) => {
  const {
    project,
    knowledge_type,
    title,
    content,
    concepts,
    files,
    severity,
    alternatives,
    reason,
    context: metaContext,
    confidence
  } = req.body;
  if (!isValidProject(project)) {
    res.status(400).json({ error: 'Invalid or missing "project"' });
    return;
  }
  if (!knowledge_type || !KNOWLEDGE_TYPES.includes(knowledge_type)) {
    res.status(400).json({ error: `Invalid "knowledge_type". Must be one of: ${KNOWLEDGE_TYPES.join(", ")}` });
    return;
  }
  if (!isValidString(title, 500)) {
    res.status(400).json({ error: 'Invalid or missing "title" (max 500 chars)' });
    return;
  }
  if (!isValidString(content, 1e5)) {
    res.status(400).json({ error: 'Invalid or missing "content" (max 100KB)' });
    return;
  }
  if (concepts && !Array.isArray(concepts)) {
    res.status(400).json({ error: '"concepts" must be an array' });
    return;
  }
  if (files && !Array.isArray(files)) {
    res.status(400).json({ error: '"files" must be an array' });
    return;
  }
  try {
    let metadata;
    switch (knowledge_type) {
      case "constraint":
        metadata = { knowledgeType: "constraint", severity: severity === "hard" ? "hard" : "soft", reason };
        break;
      case "decision":
        metadata = { knowledgeType: "decision", alternatives, reason };
        break;
      case "heuristic":
        metadata = { knowledgeType: "heuristic", context: metaContext, confidence: ["high", "medium", "low"].includes(confidence) ? confidence : void 0 };
        break;
      case "rejected":
        metadata = { knowledgeType: "rejected", reason: reason || "", alternatives };
        break;
      default:
        res.status(400).json({ error: "Invalid knowledge_type" });
        return;
    }
    const id = createObservation(
      db.db,
      "api-" + Date.now(),
      project,
      knowledge_type,
      title,
      null,
      content,
      null,
      JSON.stringify(metadata),
      concepts?.join(", ") || null,
      files?.join(", ") || null,
      null,
      0
    );
    broadcast("observation-created", { id, project, title, type: knowledge_type });
    generateEmbeddingForObservation(id, title, content, concepts).catch(() => {
    });
    res.json({ id, success: true, knowledge_type });
  } catch (error) {
    logger.error("WORKER", "Failed to store knowledge", {}, error);
    res.status(500).json({ error: "Failed to store knowledge" });
  }
});
app.post("/api/summaries", (req, res) => {
  const { sessionId, project, request, learned, completed, nextSteps } = req.body;
  if (!isValidProject(project)) {
    res.status(400).json({ error: 'Invalid or missing "project"' });
    return;
  }
  const MAX_FIELD = 5e4;
  if (request && !isValidString(request, MAX_FIELD)) {
    res.status(400).json({ error: '"request" too large' });
    return;
  }
  if (learned && !isValidString(learned, MAX_FIELD)) {
    res.status(400).json({ error: '"learned" too large' });
    return;
  }
  if (completed && !isValidString(completed, MAX_FIELD)) {
    res.status(400).json({ error: '"completed" too large' });
    return;
  }
  if (nextSteps && !isValidString(nextSteps, MAX_FIELD)) {
    res.status(400).json({ error: '"nextSteps" too large' });
    return;
  }
  try {
    const id = createSummary(
      db.db,
      sessionId || "api-" + Date.now(),
      project,
      request || null,
      null,
      learned || null,
      completed || null,
      nextSteps || null,
      null
    );
    broadcast("summary-created", { id, project });
    res.json({ id, success: true });
  } catch (error) {
    logger.error("WORKER", "Failed to store summary", {}, error);
    res.status(500).json({ error: "Failed to store summary" });
  }
});
app.get("/api/search", (req, res) => {
  const { q, project, type, limit } = req.query;
  if (!q) {
    res.status(400).json({ error: 'Query parameter "q" is required' });
    return;
  }
  try {
    const filters = {
      project: project || void 0,
      type: type || void 0,
      limit: parseIntSafe(limit, 20, 1, 100)
    };
    const results = {
      observations: searchObservationsFTS(db.db, q, filters),
      summaries: searchSummariesFiltered(db.db, q, filters)
    };
    res.json(results);
  } catch (error) {
    logger.error("WORKER", "Ricerca fallita", { query: q }, error);
    res.status(500).json({ error: "Search failed" });
  }
});
app.get("/api/timeline", (req, res) => {
  const { anchor, depth_before, depth_after } = req.query;
  if (!anchor) {
    res.status(400).json({ error: 'Query parameter "anchor" is required' });
    return;
  }
  const anchorId = parseIntSafe(anchor, 0, 1, Number.MAX_SAFE_INTEGER);
  if (anchorId === 0) {
    res.status(400).json({ error: 'Invalid "anchor" (must be positive integer)' });
    return;
  }
  try {
    const timeline = getTimeline(
      db.db,
      anchorId,
      parseIntSafe(depth_before, 5, 1, 50),
      parseIntSafe(depth_after, 5, 1, 50)
    );
    res.json({ timeline });
  } catch (error) {
    logger.error("WORKER", "Timeline fallita", { anchor }, error);
    res.status(500).json({ error: "Timeline failed" });
  }
});
app.post("/api/observations/batch", (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
    res.status(400).json({ error: '"ids" must be an array of 1-100 elements' });
    return;
  }
  if (!ids.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0)) {
    res.status(400).json({ error: "All IDs must be positive integers" });
    return;
  }
  try {
    const observations = getObservationsByIds(db.db, ids);
    res.json({ observations });
  } catch (error) {
    logger.error("WORKER", "Batch fetch fallito", { ids }, error);
    res.status(500).json({ error: "Batch fetch failed" });
  }
});
app.get("/api/stats/:project", (req, res) => {
  const { project } = req.params;
  if (!isValidProject(project)) {
    res.status(400).json({ error: "Invalid project name" });
    return;
  }
  try {
    const stats = getProjectStats(db.db, project);
    res.json(stats);
  } catch (error) {
    logger.error("WORKER", "Stats fallite", { project }, error);
    res.status(500).json({ error: "Stats failed" });
  }
});
async function generateEmbeddingForObservation(observationId, title, content, concepts) {
  try {
    const embeddingService2 = getEmbeddingService();
    if (!embeddingService2.isAvailable()) return;
    const parts = [title];
    if (content) parts.push(content);
    if (concepts?.length) parts.push(concepts.join(", "));
    const fullText = parts.join(" ").substring(0, 2e3);
    const embedding = await embeddingService2.embed(fullText);
    if (embedding) {
      const vectorSearch2 = getVectorSearch();
      await vectorSearch2.storeEmbedding(
        db.db,
        observationId,
        embedding,
        embeddingService2.getProvider() || "unknown"
      );
    }
  } catch (error) {
    logger.debug("WORKER", `Embedding generation fallita per obs ${observationId}: ${error}`);
  }
}
app.get("/api/hybrid-search", async (req, res) => {
  const { q, project, limit } = req.query;
  if (!q) {
    res.status(400).json({ error: 'Query parameter "q" is required' });
    return;
  }
  try {
    const hybridSearch2 = getHybridSearch();
    const results = await hybridSearch2.search(db.db, q, {
      project: project || void 0,
      limit: parseIntSafe(limit, 10, 1, 100)
    });
    res.json({ results, count: results.length });
  } catch (error) {
    logger.error("WORKER", "Ricerca ibrida fallita", { query: q }, error);
    res.status(500).json({ error: "Hybrid search failed" });
  }
});
app.post("/api/embeddings/backfill", async (req, res) => {
  const { batchSize } = req.body || {};
  try {
    const vectorSearch2 = getVectorSearch();
    const count = await vectorSearch2.backfillEmbeddings(
      db.db,
      parseIntSafe(String(batchSize), 50, 1, 500)
    );
    res.json({ success: true, generated: count });
  } catch (error) {
    logger.error("WORKER", "Backfill embeddings fallito", {}, error);
    res.status(500).json({ error: "Backfill failed" });
  }
});
app.get("/api/embeddings/stats", (_req, res) => {
  try {
    const vectorSearch2 = getVectorSearch();
    const stats = vectorSearch2.getStats(db.db);
    const embeddingService2 = getEmbeddingService();
    res.json({
      ...stats,
      provider: embeddingService2.getProvider(),
      dimensions: embeddingService2.getDimensions(),
      available: embeddingService2.isAvailable()
    });
  } catch (error) {
    logger.error("WORKER", "Embedding stats fallite", {}, error);
    res.status(500).json({ error: "Stats failed" });
  }
});
app.get("/api/observations", (req, res) => {
  const { offset, limit, project } = req.query;
  const _offset = parseIntSafe(offset, 0, 0, 1e6);
  const _limit = parseIntSafe(limit, 50, 1, 200);
  try {
    const countSql = project ? "SELECT COUNT(*) as total FROM observations WHERE project = ?" : "SELECT COUNT(*) as total FROM observations";
    const countStmt = db.db.query(countSql);
    const { total } = project ? countStmt.get(project) : countStmt.get();
    const sql = project ? "SELECT * FROM observations WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?" : "SELECT * FROM observations ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?";
    const stmt = db.db.query(sql);
    const rows = project ? stmt.all(project, _limit, _offset) : stmt.all(_limit, _offset);
    res.setHeader("X-Total-Count", total);
    res.json(rows);
  } catch (error) {
    logger.error("WORKER", "Lista osservazioni fallita", {}, error);
    res.status(500).json({ error: "Failed to list observations" });
  }
});
app.get("/api/summaries", (req, res) => {
  const { offset, limit, project } = req.query;
  const _offset = parseIntSafe(offset, 0, 0, 1e6);
  const _limit = parseIntSafe(limit, 20, 1, 200);
  try {
    const countSql = project ? "SELECT COUNT(*) as total FROM summaries WHERE project = ?" : "SELECT COUNT(*) as total FROM summaries";
    const countStmt = db.db.query(countSql);
    const { total } = project ? countStmt.get(project) : countStmt.get();
    const sql = project ? "SELECT * FROM summaries WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?" : "SELECT * FROM summaries ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?";
    const stmt = db.db.query(sql);
    const rows = project ? stmt.all(project, _limit, _offset) : stmt.all(_limit, _offset);
    res.setHeader("X-Total-Count", total);
    res.json(rows);
  } catch (error) {
    logger.error("WORKER", "Lista summary fallita", {}, error);
    res.status(500).json({ error: "Failed to list summaries" });
  }
});
app.get("/api/prompts", (req, res) => {
  const { offset, limit, project } = req.query;
  const _offset = parseIntSafe(offset, 0, 0, 1e6);
  const _limit = parseIntSafe(limit, 20, 1, 200);
  try {
    const countSql = project ? "SELECT COUNT(*) as total FROM prompts WHERE project = ?" : "SELECT COUNT(*) as total FROM prompts";
    const countStmt = db.db.query(countSql);
    const { total } = project ? countStmt.get(project) : countStmt.get();
    const sql = project ? "SELECT * FROM prompts WHERE project = ? ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?" : "SELECT * FROM prompts ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?";
    const stmt = db.db.query(sql);
    const rows = project ? stmt.all(project, _limit, _offset) : stmt.all(_limit, _offset);
    res.setHeader("X-Total-Count", total);
    res.json(rows);
  } catch (error) {
    logger.error("WORKER", "Lista prompt fallita", {}, error);
    res.status(500).json({ error: "Failed to list prompts" });
  }
});
app.get("/api/project-aliases", (_req, res) => {
  try {
    const stmt = db.db.query("SELECT project_name, display_name FROM project_aliases");
    const rows = stmt.all();
    const aliases = {};
    for (const row of rows) {
      aliases[row.project_name] = row.display_name;
    }
    res.json(aliases);
  } catch (error) {
    logger.error("WORKER", "Failed to list project aliases", {}, error);
    res.status(500).json({ error: "Failed to list project aliases" });
  }
});
app.put("/api/project-aliases/:project", (req, res) => {
  const { project } = req.params;
  const { displayName } = req.body;
  if (!isValidProject(project)) {
    res.status(400).json({ error: "Invalid project name" });
    return;
  }
  if (!displayName || typeof displayName !== "string" || displayName.trim().length === 0 || displayName.length > 100) {
    res.status(400).json({ error: 'Field "displayName" is required (string, max 100 chars)' });
    return;
  }
  try {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const stmt = db.db.query(`
      INSERT INTO project_aliases (project_name, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_name) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at
    `);
    stmt.run(project, displayName.trim(), now, now);
    res.json({ ok: true, project_name: project, display_name: displayName.trim() });
  } catch (error) {
    logger.error("WORKER", "Failed to update project alias", { project }, error);
    res.status(500).json({ error: "Failed to update project alias" });
  }
});
var projectsCache = { data: [], ts: 0 };
var PROJECTS_CACHE_TTL = 6e4;
app.get("/api/projects", (_req, res) => {
  try {
    const now = Date.now();
    if (now - projectsCache.ts < PROJECTS_CACHE_TTL && projectsCache.data.length > 0) {
      res.json(projectsCache.data);
      return;
    }
    const stmt = db.db.query(
      `SELECT DISTINCT project FROM (
        SELECT project FROM observations
        UNION
        SELECT project FROM summaries
        UNION
        SELECT project FROM prompts
      ) ORDER BY project ASC`
    );
    const rows = stmt.all();
    projectsCache = { data: rows.map((r) => r.project), ts: now };
    res.json(projectsCache.data);
  } catch (error) {
    logger.error("WORKER", "Lista progetti fallita", {}, error);
    res.status(500).json({ error: "Failed to list projects" });
  }
});
app.get("/api/analytics/overview", (req, res) => {
  const { project } = req.query;
  if (project && !isValidProject(project)) {
    res.status(400).json({ error: "Invalid project name" });
    return;
  }
  try {
    const overview = getAnalyticsOverview(db.db, project || void 0);
    res.json(overview);
  } catch (error) {
    logger.error("WORKER", "Analytics overview fallita", { project }, error);
    res.status(500).json({ error: "Analytics overview failed" });
  }
});
app.get("/api/analytics/timeline", (req, res) => {
  const { project, days } = req.query;
  if (project && !isValidProject(project)) {
    res.status(400).json({ error: "Invalid project name" });
    return;
  }
  try {
    const timeline = getObservationsTimeline(
      db.db,
      project || void 0,
      parseIntSafe(days, 30, 1, 365)
    );
    res.json(timeline);
  } catch (error) {
    logger.error("WORKER", "Analytics timeline fallita", { project }, error);
    res.status(500).json({ error: "Analytics timeline failed" });
  }
});
app.get("/api/analytics/types", (req, res) => {
  const { project } = req.query;
  if (project && !isValidProject(project)) {
    res.status(400).json({ error: "Invalid project name" });
    return;
  }
  try {
    const distribution = getTypeDistribution(db.db, project || void 0);
    res.json(distribution);
  } catch (error) {
    logger.error("WORKER", "Analytics types fallita", { project }, error);
    res.status(500).json({ error: "Analytics types failed" });
  }
});
app.get("/api/analytics/sessions", (req, res) => {
  const { project } = req.query;
  if (project && !isValidProject(project)) {
    res.status(400).json({ error: "Invalid project name" });
    return;
  }
  try {
    const stats = getSessionStats(db.db, project || void 0);
    res.json(stats);
  } catch (error) {
    logger.error("WORKER", "Analytics sessions fallita", { project }, error);
    res.status(500).json({ error: "Analytics sessions failed" });
  }
});
app.get("/api/sessions", (req, res) => {
  const { project } = req.query;
  if (project && !isValidProject(project)) {
    res.status(400).json({ error: "Invalid project name" });
    return;
  }
  try {
    const sessions = project ? getSessionsByProject(db.db, project, 50) : getActiveSessions(db.db);
    res.json(sessions);
  } catch (error) {
    logger.error("WORKER", "Lista sessioni fallita", { project }, error);
    res.status(500).json({ error: "Sessions list failed" });
  }
});
app.get("/api/sessions/:id/checkpoint", (req, res) => {
  const sessionId = parseInt(req.params.id, 10);
  if (isNaN(sessionId) || sessionId <= 0) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }
  try {
    const checkpoint = getLatestCheckpoint(db.db, sessionId);
    if (!checkpoint) {
      res.status(404).json({ error: "No checkpoint found for this session" });
      return;
    }
    res.json(checkpoint);
  } catch (error) {
    logger.error("WORKER", "Checkpoint fetch fallito", { sessionId }, error);
    res.status(500).json({ error: "Checkpoint fetch failed" });
  }
});
app.get("/api/checkpoint", (req, res) => {
  const { project } = req.query;
  if (!project) {
    res.status(400).json({ error: "Project parameter is required" });
    return;
  }
  if (!isValidProject(project)) {
    res.status(400).json({ error: "Invalid project name" });
    return;
  }
  try {
    const checkpoint = getLatestCheckpointByProject(db.db, project);
    if (!checkpoint) {
      res.status(404).json({ error: "No checkpoint found for this project" });
      return;
    }
    res.json(checkpoint);
  } catch (error) {
    logger.error("WORKER", "Checkpoint per progetto fallito", { project }, error);
    res.status(500).json({ error: "Project checkpoint fetch failed" });
  }
});
app.get("/api/report", (req, res) => {
  const { project, period, format } = req.query;
  if (project && !isValidProject(project)) {
    res.status(400).json({ error: "Invalid project name" });
    return;
  }
  const validPeriods = ["weekly", "monthly"];
  const reportPeriod = validPeriods.includes(period || "") ? period : "weekly";
  const daysBack = reportPeriod === "monthly" ? 30 : 7;
  const now = Date.now();
  const startEpoch = now - daysBack * 24 * 60 * 60 * 1e3;
  try {
    const data = getReportData(db.db, project || void 0, startEpoch, now);
    const outputFormat = format || "json";
    if (outputFormat === "markdown" || outputFormat === "md") {
      res.type("text/markdown").send(formatReportMarkdown(data));
    } else if (outputFormat === "text") {
      res.type("text/plain").send(JSON.stringify(data, null, 2));
    } else {
      res.json(data);
    }
  } catch (error) {
    logger.error("WORKER", "Report generation fallita", { project, period }, error);
    res.status(500).json({ error: "Report generation failed" });
  }
});
app.post("/api/memory/save", (req, res) => {
  const { project, title, content, type, concepts } = req.body;
  if (!isValidProject(project)) {
    res.status(400).json({ error: 'Invalid or missing "project"' });
    return;
  }
  if (!isValidString(title, 500)) {
    res.status(400).json({ error: 'Invalid or missing "title" (max 500 chars)' });
    return;
  }
  if (!isValidString(content, 1e5)) {
    res.status(400).json({ error: 'Invalid or missing "content" (max 100KB)' });
    return;
  }
  const obsType = type || "research";
  const conceptStr = Array.isArray(concepts) ? concepts.join(", ") : concepts || null;
  try {
    const id = createObservation(
      db.db,
      "memory-save-" + Date.now(),
      project,
      obsType,
      title,
      null,
      // subtitle
      content,
      // text
      content,
      // narrative
      null,
      // facts
      conceptStr,
      null,
      // filesRead
      null,
      // filesModified
      0
      // promptNumber
    );
    broadcast("observation-created", { id, project, title });
    projectsCache.ts = 0;
    generateEmbeddingForObservation(id, title, content, Array.isArray(concepts) ? concepts : void 0).catch(() => {
    });
    res.json({ id, success: true });
  } catch (error) {
    logger.error("WORKER", "Memory save fallito", {}, error);
    res.status(500).json({ error: "Failed to save memory" });
  }
});
app.post("/api/retention/cleanup", (req, res) => {
  const { maxAgeDays, dryRun } = req.body || {};
  const days = parseIntSafe(String(maxAgeDays), 90, 7, 730);
  const threshold = Date.now() - days * 864e5;
  try {
    if (dryRun) {
      const obsCount = db.db.query("SELECT COUNT(*) as c FROM observations WHERE created_at_epoch < ?").get(threshold).c;
      const sumCount = db.db.query("SELECT COUNT(*) as c FROM summaries WHERE created_at_epoch < ?").get(threshold).c;
      const promptCount = db.db.query("SELECT COUNT(*) as c FROM prompts WHERE created_at_epoch < ?").get(threshold).c;
      res.json({ dryRun: true, maxAgeDays: days, wouldDelete: { observations: obsCount, summaries: sumCount, prompts: promptCount } });
      return;
    }
    const cleanup = db.db.transaction(() => {
      db.db.run("DELETE FROM observation_embeddings WHERE observation_id IN (SELECT id FROM observations WHERE created_at_epoch < ?)", [threshold]);
      const obsResult = db.db.run("DELETE FROM observations WHERE created_at_epoch < ?", [threshold]);
      const sumResult = db.db.run("DELETE FROM summaries WHERE created_at_epoch < ?", [threshold]);
      const promptResult = db.db.run("DELETE FROM prompts WHERE created_at_epoch < ?", [threshold]);
      return {
        observations: obsResult.changes,
        summaries: sumResult.changes,
        prompts: promptResult.changes
      };
    });
    const deleted = cleanup();
    projectsCache.ts = 0;
    logger.info("WORKER", `Retention cleanup: eliminati ${deleted.observations} obs, ${deleted.summaries} sum, ${deleted.prompts} prompts (> ${days}gg)`);
    res.json({ success: true, maxAgeDays: days, deleted });
  } catch (error) {
    logger.error("WORKER", "Retention cleanup fallito", { maxAgeDays: days }, error);
    res.status(500).json({ error: "Retention cleanup failed" });
  }
});
app.get("/api/export", (req, res) => {
  const { project, format: fmt, type, days } = req.query;
  if (project && !isValidProject(project)) {
    res.status(400).json({ error: "Invalid project name" });
    return;
  }
  const daysBack = parseIntSafe(days, 30, 1, 365);
  const threshold = Date.now() - daysBack * 864e5;
  try {
    let sql = "SELECT * FROM observations WHERE created_at_epoch > ?";
    const params = [threshold];
    if (project) {
      sql += " AND project = ?";
      params.push(project);
    }
    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }
    sql += " ORDER BY created_at_epoch DESC LIMIT 1000";
    const observations = db.db.query(sql).all(...params);
    let sumSql = "SELECT * FROM summaries WHERE created_at_epoch > ?";
    const sumParams = [threshold];
    if (project) {
      sumSql += " AND project = ?";
      sumParams.push(project);
    }
    sumSql += " ORDER BY created_at_epoch DESC LIMIT 100";
    const summaries = db.db.query(sumSql).all(...sumParams);
    if (fmt === "markdown" || fmt === "md") {
      const lines = [
        `# Kiro Memory Export`,
        `> Project: ${project || "All"} | Period: ${daysBack} days | Generated: ${(/* @__PURE__ */ new Date()).toISOString()}`,
        "",
        `## Observations (${observations.length})`,
        ""
      ];
      for (const obs of observations) {
        const date = new Date(obs.created_at_epoch).toISOString().split("T")[0];
        lines.push(`### [${obs.type}] ${obs.title}`);
        lines.push(`- **Date**: ${date} | **Project**: ${obs.project} | **ID**: #${obs.id}`);
        if (obs.narrative) lines.push(`- ${obs.narrative}`);
        if (obs.concepts) lines.push(`- **Concepts**: ${obs.concepts}`);
        lines.push("");
      }
      lines.push(`## Summaries (${summaries.length})`, "");
      for (const sum of summaries) {
        const date = new Date(sum.created_at_epoch).toISOString().split("T")[0];
        lines.push(`### Session ${sum.session_id} (${date})`);
        if (sum.request) lines.push(`- **Request**: ${sum.request}`);
        if (sum.completed) lines.push(`- **Completed**: ${sum.completed}`);
        if (sum.next_steps) lines.push(`- **Next steps**: ${sum.next_steps}`);
        lines.push("");
      }
      res.type("text/markdown").send(lines.join("\n"));
    } else {
      res.json({
        meta: { project: project || "all", daysBack, exportedAt: (/* @__PURE__ */ new Date()).toISOString() },
        observations,
        summaries
      });
    }
  } catch (error) {
    logger.error("WORKER", "Export fallito", { project, fmt }, error);
    res.status(500).json({ error: "Export failed" });
  }
});
app.use(express.static(__worker_dirname, {
  index: false,
  maxAge: "1h"
}));
app.get("/", (_req, res) => {
  const viewerPath = join3(__worker_dirname, "viewer.html");
  if (existsSync4(viewerPath)) {
    res.sendFile(viewerPath);
  } else {
    res.status(404).json({ error: "Viewer not found. Run npm run build first." });
  }
});
var server = app.listen(Number(PORT), HOST, () => {
  logger.info("WORKER", `Kiro Memory worker started on http://${HOST}:${PORT}`);
  writeFileSync(PID_FILE, String(process.pid), "utf-8");
});
function shutdown(signal) {
  logger.info("WORKER", `Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    logger.info("WORKER", "Server closed");
    if (existsSync4(PID_FILE)) {
      unlinkSync(PID_FILE);
    }
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (error) => {
  logger.error("WORKER", "Uncaught exception", {}, error);
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason, promise) => {
  logger.error("WORKER", "Unhandled rejection", { reason }, reason);
});
