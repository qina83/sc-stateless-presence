(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.scStatelessPresenceClient = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

var SCStatelessPresenceClient = function (socket, options) {
  var self = this;

  options = options || {};

  this.presenceChannelPrefix = 'presence>';
  this.socket = socket;
  this.channelUsers = {};
  this.channelListeners = {};

  this.presenceCheckInterval = options.presenceCheckInterval || 1000;
  this._setupPresenceExpiryInterval();

  var lastSocketId = null;

  socket.on('connect', function () {
    lastSocketId = socket.id;
    var socketChannelName = self._getSocketPresenceChannelName(lastSocketId);
    self.socket.subscribe(socketChannelName).watch(function (presencePacket) {
      if (presencePacket.type == 'pong') {
        self.channelUsers[presencePacket.channel][presencePacket.username] = {
          expiry: Date.now() + presencePacket.timeout
        };
        self.channelListeners[presencePacket.channel].forEach(function (listener) {
          listener({
            action: 'join',
            username: presencePacket.username
          });
        });
      }
    });
  });
  socket.on('disconnect', function () {
    var socketChannelName = self._getSocketPresenceChannelName(lastSocketId);
    self.socket.unsubscribe(socketChannelName);
  });
};

SCStatelessPresenceClient.prototype._getSocketPresenceChannelName = function (socketId) {
  return this.presenceChannelPrefix + 'socket/' + socketId;
};

SCStatelessPresenceClient.prototype._setupPresenceExpiryInterval = function () {
  var self = this;

  setInterval(function () {
    Object.keys(self.channelUsers).forEach(function (channelName) {
      Object.keys(self.channelUsers[channelName] || {}).forEach(function (username) {
        var userData = self.channelUsers[channelName][username];
        if (userData.expiry < Date.now()) {
          self.channelListeners[channelName].forEach(function (listener) {
            listener({
              action: 'leave',
              username: username
            });
          });
          delete self.channelUsers[channelName][username];
        }
      });
    });
  }, this.presenceCheckInterval);
};

SCStatelessPresenceClient.prototype.isPresent = function (channelName, username) {
  return !!(this.channelUsers[channelName] && this.channelUsers[channelName][username]);
};

SCStatelessPresenceClient.prototype.getPresenceList = function (channelName) {
  var userMap = this.channelUsers[channelName];
  var userList = [];
  
  for (var username in userMap) {
    if (userMap.hasOwnProperty(username)) {
      userList.push(username);
    }
  }
  return userList;
};

SCStatelessPresenceClient.prototype.trackPresence = function (channelName, listener) {
  var self = this;

  if (!this.channelUsers[channelName]) {
    this.channelUsers[channelName] = {};
  }
  var presenceChannelName = this.presenceChannelPrefix + channelName;
  if (!this.socket.isSubscribed(presenceChannelName, true)) {
    this.socket.subscribe(presenceChannelName).watch(function (presencePacket) {
      var now = Date.now();
      if (presencePacket.type == 'join') {
        self.channelUsers[channelName][presencePacket.username] = {
          expiry: Date.now() + presencePacket.timeout
        };
        listener({
          action: 'join',
          username: presencePacket.username
        });
        var socketChannelName = self._getSocketPresenceChannelName();
        socket.publish(socketChannelName, {
          type: 'pong',
          channel: channelName,
          username: presencePacket.username,
          timeout: presencePacket.timeout
        });
      } else if (presencePacket.type == 'leave') {
        delete self.channelUsers[channelName][presencePacket.username];
        listener({
          action: 'leave',
          username: presencePacket.username
        });
      } else if (presencePacket.type == 'ping') {
        presencePacket.users.forEach(function (username) {
          self.channelUsers[channelName][username] = {
            expiry: now + presencePacket.timeout
          };
        });
      }
    });
  }
  if (!this.channelListeners[channelName]) {
    this.channelListeners[channelName] = [];
  }
  this.channelListeners[channelName].push(listener);
};

module.exports.SCStatelessPresenceClient = SCStatelessPresenceClient;
module.exports.create = function (socket, options) {
  return new SCStatelessPresenceClient(socket, options);
};

},{}]},{},[1])(1)
});