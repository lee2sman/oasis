var Promise = require('promise');
var twitter_helper = require ('./twitter_helper.js');
var _log = require('./log_helper.js')._log;
var child_process = require('child_process');
var util = require('util');
var settings = require('./settings.js');
var path = require("path");
var fs = require('fs');


var dm_id_file = path.join(settings.base_dir, '../data/dm_id.txt');


var exec_cmd = function(cmd, success_msg) {
    return new Promise(function (fulfill, reject) {
        _log(util.format('cmd: %s', cmd));
        child_process.exec(cmd, function (error, stdout, stderr) {
            //_log(util.format('stdout: %s', stdout));
            if (error) {
                _log(util.format('XX: error: %j', error));
                _log(util.format('XX: stderr: %s', stderr));
                reject(error);
            }
            else if (error == null && success_msg != null) {
                _log(success_msg);
                fulfill(error);
            }
            else {
                fulfill(error);
            }
        });
    });
};

var create_user = function(username, password) {
    username = username.replace(/\W/g, '');
    password = password.replace(/\W/g, '');
    var create_user_script = path.join(settings.base_dir, 'bash/create_new_user.sh');
    var create_user_cmd = util.format('%s %s %s', create_user_script, username, password);
    return exec_cmd(create_user_cmd, util.format('++ @channel: successfully created user: %s', username));
};


var process_dm = function(dm) {
    var success = false;
    console.log(util.format('screen_name: %s', dm['sender_screen_name']));
    console.log(util.format('message: %s', dm['text']));
    console.log(util.format('id: %s', dm['id']));
    // write id to a file
    var myRegexp = /(\S+)\s*\/\s*(\S+)/g;
    var match = myRegexp.exec(dm['text']);
    if (match) {
        var username = match[1];
        var password = match[2];
        console.log(util.format('++ create user: %s %s', username, password));
        var user_promise = create_user(username, password);
        // now tweet back at the user that their user was created
        user_promise.done(function(res) {
            twitter_helper.post_dm('OK', dm['sender_screen_name']);
            // get most recent tweet of correct format
            var tweets_promise = twitter_helper.get_timeline();
            tweets_promise.done(function(response) {
                var tweets = JSON.parse(response['body']);
                console.log(util.format('tweet: %j', Object.keys(tweets[0])));
                var host = '';
                var port = '';
                var index = 0;
                while (host == '') {
                    var tweet = tweets[index];
                    var myRegexp = /ssh \S+@(\S+) -p(\S+)/g;
                    var match = myRegexp.exec(tweet['text']);
                    if (match) {
                        host = match[1];
                        port = match[2];
                    }
                    index += 1;
                }
                twitter_helper.post_tweet(util.format('@%s ssh %s@%s -p%s', dm['sender_screen_name'], username, host, port));
                success = true;
            });
        }, function(err) {
            twitter_helper.post_dm('500: invalid username', dm['sender_screen_name']);
        });
        // ls /home
    }
    else {
        twitter_helper.post_dm('500: invalid username', dm['sender_screen_name']);
    }
    if (!success) {
        _log(util.format('@channel: failed to process dm for @%s', dm['sender_screen_name']));
    }
};


var save_dm_id = function(dm_id) {
    fs.writeFile(dm_id_file, dm_id, function(err) {
        if(err) {
            return console.log(err);
        }
        console.log(util.format('++ saved dm_id: %s', dm_id));
    });
};

var read_dm_id = function() {
    return new Promise(function (fulfill, reject) {
        if (fs.existsSync(dm_id_file)) {
            fs.readFile(dm_id_file, 'utf8', function (err, data) {
                if (err) {
                    reject(err);
                }
                fulfill(data);
            });
        }
        else {
            fulfill(0);
        }
    });
};


var create_new_users = function() {
    _log('++ looking for new users to create');
    // read id from a file
    var last_dm_id_promise = read_dm_id();
    last_dm_id_promise.done(function(dm_id) {
        console.log(util.format('last_dm_id: %s', dm_id));
        var dms_promise = twitter_helper.get_dms(dm_id);
        console.log('dms_promise: %j', dms_promise);
        dms_promise.done(function(response) {
            var dms = JSON.parse(response['body']);
            for (i = 0; i < dms.length; i++) {
                var dm = dms[i];
                save_dm_id(dm['id']);
                process_dm(dm);
            }
        });
    });
};



if (require.main === module) {
    create_new_users();
}