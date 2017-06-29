/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express');                                               // Express web server framework
var request = require('request');                                               // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

/**
 * Handle internal Access and Refresh tokens
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var getAccessToken = function() {
  //TODO: Implement access token refresh functionality. For now, just return the one that was saved in the tokens call
  return globalTokens ? globalTokens.access_token : "";
};

var client_id = '1bb3f0efb6d84df4a4155bcc74038083'                              //'CLIENT_ID'; // Your client id
var client_secret = 'f1de957cefa1487aa1d51cc1e002b5d6';                         // Your secret
var redirect_uri = 'http://enroivMCWKST:8888/logincallback';                    // Your redirect uri
var stateKey = 'spotify_auth_state';                                            // State cookie identifier
var authScope = 'user-read-private user-read-email playlist-read-private';      // Requested permissions
var allSongs = {};                                                              // All my spotify songs

var spEndpoints = {
  authorize: 'https://accounts.spotify.com/authorize?',
  token:     'https://accounts.spotify.com/api/token',
  playlists: 'https://api.spotify.com/v1/users/{user_id}/playlists?',
  callback:  'http://enroivMCWKST:8888/logincallback'
};

var globalTokens = null;

var app = express();
app.use(express.static(__dirname + '/public')).use(cookieParser());

/****
 * Authorization endpoint
 ************************/
app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // Set query string to call authorize endpoint
  var stgfy =  querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: authScope,
      redirect_uri: redirect_uri,
      state: state
    });

  // Authorization is requested
  res.redirect(spEndpoints.authorize + stgfy);

});

/****
 * Callback
 **********/
app.get('/logincallback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter
  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if ((state === null || state !== storedState)) {
    console.log((state===null)?"null state":"state!=storedState");
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {

    // A valid state was received and has been validated. Next flows don't need it.
    res.clearCookie(stateKey);

    // Prepare tokens call
    var authOptions = {
      url: spEndpoints.token,
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    // Request Refresh and Access tokens
    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        // Store the tokens
        globalTokens = body;

        // Display current user info
        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + globalTokens.access_token },
          json: true
        };

        // Use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {

          if(!error && response.statusCode === 200){
            // Replace the current user id in the playlists endpoint
            spEndpoints.playlists = spEndpoints.playlists.replace('{user_id}',body.id);

            // and call the playlists function
            playlists();
          }
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: globalTokens.access_token,
            refresh_token: globalTokens.refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

/*
Get a List of a User’s Playlists
GET https://api.spotify.com/v1/users/{user_id}/playlists
QUERY PARAMETER
limit (Optional). The maximum number of playlists to return. Default: 20. Minimum: 1. Maximum: 50.

On success, the HTTP status code in the response header is 200 OK and the response body contains an
array of simplified playlist objects (wrapped in a paging object) in JSON format.
On error, the header status code is an error code and the response body contains an error object.
*/
var playlists = function(endpoint){

  // Set up the playlists call
  var options = {
    url: endpoint ? endpoint : spEndpoints.playlists + querystring.stringify({limit: 50}),
    headers: { 'Authorization': 'Bearer ' + globalTokens.access_token },
    json: true
  };

  // Get playlists
  request.get(options,function(error,response,body){

    if(!error && response.statusCode === 200){

      body.items.forEach(function(pl){
        playlist(pl.href);
      });

      if(body.next) playlists(body.next);
    }

  });

};

/*
 *  Get a playlist owned by a Spotify user.
 *
 *  Endpoint
 *  GET https://api.spotify.com/v1/users/{user_id}/playlists/{playlist_id}
*/
var playlist = function(endpoint){

  // Set up the playlist call
  var options = {
    url: endpoint,
    headers: { 'Authorization': 'Bearer ' + globalTokens.access_token },
    json: true
  };

  // Get playlist
  request.get(options,function(error,response,body){

    if(!error && response.statusCode === 200){
      extractDetail(body.name,body.tracks);
    }

  });
};

/*****
 * Process each playlist
 ***********************/
 var extractDetail = function(pNam,tracks){
   processTracks(pNam,tracks.items);
   if(tracks.next) getNextTracks(pNam,tracks.next);

 };

 /*****
  * Process each track
  ***********************/
  var processTracks = function(pNam,items){

    console.log("Processing playlist "+pNam);

    var lesChansons = {};
    lesChansons[pNam] = {};
    var entries = lesChansons[pNam];
    items.forEach(function(item){

      entries[item.track.name] = {
        "artist": item.track.artists[0].name,
        "album": item.track.album.name
      }
    });

    accumulate(lesChansons);

  };

  /*****
  * Get next page of tracks
  ***********************/
  var getNextTracks = function(pNam,endpoint){

    // Set up the next track page call
    var options = {
      url: endpoint,
      headers: { 'Authorization': 'Bearer ' + globalTokens.access_token },
      json: true
    };

    // Get next page
    request.get(options,function(error,response,body){

      if(!error && response.statusCode === 200){
        extractDetail(pNam,body);
      }

    });

  };

  var accumulate = function(lesChansons){
    /*
    var lesChansons = {
      'playlist':{
        'song':{
          "artist":"artist",
          "album":"album"
        }
      }
    };
    */

    for (var playlist in lesChansons){
      if(lesChansons.hasOwnProperty(playlist)){
        var pl = lesChansons[playlist];

        console.log("Adding <" +playlist+"> entries");
        if(!allSongs.hasOwnProperty(playlist)){
          // Playlist has not been added to global playlists object
          allSongs[playlist] = pl;
        }
        else{
          // There is alreadt an entry associated with this playlist, add missing songs
          var existingPl = allSongs[playlist];

          for(var song in pl){
            if(pl.hasOwnProperty(song)){
              var sng = pl[song];
              existingPl[song]=sng;
            }
          }
        }
      }
    }

    showAllSongs();
  };

  var showAllSongs = function(){
    console.log("**************************************");
    console.log("**************************************");
    console.log("**************************************");
    for(var playlist in allSongs){
      if(allSongs.hasOwnProperty(playlist)){
        var pList = allSongs[playlist];
        console.log("Playlist: "+playlist);

        for(var song in pList){
          if(pList.hasOwnProperty(song)){
            var sng = pList[song];
            console.log(song+"\t"+sng.artist+"\t"+sng.album);
          }
        }

        console.log("----------------------\n");
      }
    }
    console.log("**************************************");
    console.log("**************************************");
    console.log("**************************************");
  };


/*****
 * 404 catch block
 *****************/
app.use(function (req, res, next) {
  console.log("404 headers: " + JSON.stringify(req.headers));
  console.log("Location called: " + req.path);
  res.status(404).send("Sorry can't find that: "+req.path);
})

/*****
 * Initialize main application
 *****************************/
console.log('Listening on 8888');
app.listen(8888);
