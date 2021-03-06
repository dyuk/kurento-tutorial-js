/*
* (C) Copyright 2014 Kurento (http://kurento.org/)
*
* All rights reserved. This program and the accompanying materials
* are made available under the terms of the GNU Lesser General Public License
* (LGPL) version 2.1 which accompanies this distribution, and is available at
* http://www.gnu.org/licenses/lgpl-2.1.html
*
* This library is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
* Lesser General Public License for more details.
*
*/

function getopts(args, opts)
{
  var result = opts.default || {};
  args.replace(
      new RegExp("([^?=&]+)(=([^&]*))?", "g"),
      function($0, $1, $2, $3) { result[$1] = $3; });

  return result;
};

var args = getopts(location.search,
{
  default:
  {
    ws_uri:   'ws://' + location.hostname + ':8888/kurento',
    file_uri: 'file:///tmp/recorder_demo.webm', //file to be stored in media server
    as_uri:   'http://' + location.host,
    ice_servers: undefined
  }
});

if (args.ice_servers) {
  console.log("Use ICE servers: " + args.ice_servers);
  kurentoUtils.WebRtcPeer.prototype.server.iceServers = JSON.parse(args.ice_servers);
} else {
  console.log("Use freeice")
}


const hat_uri = args.as_uri+"/img/Hat.png";
const window_uri = args.as_uri+"/img/Brown_Monsters_40-01.png";
const hover_window_uri = args.as_uri+"/img/Brown_Monsters_25-01.png";


window.addEventListener('load', function(event) {
  kurentoClient.register(kurentoModulePointerdetector);

	var startRecordButton = document.getElementById('startRecordButton');
	var playButton = document.getElementById('startPlayButton');

	startRecordButton.addEventListener('click', startRecording);
	playButton.addEventListener('click', startPlaying);

});

function startRecording() {
	var videoInput = document.getElementById("videoInput");
	var videoOutput = document.getElementById("videoOutput");
	var calibrateButton = document.getElementById("calibratePointerDetector");
	var stopRecordButton = document.getElementById("stopRecordButton");

	webRtcPeer = kurentoUtils.WebRtcPeer.startSendRecv(videoInput, videoOutput,
			onOffer, onError);

	function onOffer(offer) {
		console.log("Local SDP received. Start buidling pipeline ...");
		co(function*(){
			try {
				var client = yield new kurentoClient(args.ws_uri);
				pipeline   = yield client.create("MediaPipeline");
				recorder   = yield pipeline.create("RecorderEndpoint", {uri: args.file_uri});
				var webRtc = yield pipeline.create("WebRtcEndpoint");
				var faceOverlay = yield pipeline.create("FaceOverlayFilter");
				var mirror = yield pipeline.create("GStreamerFilter",
						{command : "videoflip method=4"});

				var calibrationRegion =
        {
          topRightCornerX: 0,
          topRightCornerY: 0,
          width: 50,
          height: 50
        };

				var pointerDetector = yield pipeline.create("PointerDetectorFilter",
				    {calibrationRegion : calibrationRegion});
				var buttonWindow = {
						id: "myWindow",
						height: 100,
						width: 100,
						upperRightX: 500,
						upperRightY: 250,
						image: window_uri,
						activeImage: hover_window_uri
				};
				yield pointerDetector.addWindow(buttonWindow);

				var times = 0;
				pointerDetector.on("WindowIn", function(event){
					var offsetXPercent = -0.2;
					var offsetYPercent = -1.35;
					var widthPercent = 1.5;
					var heightPercent = 1.5;
					times++;
					if(times % 2){
						faceOverlay.setOverlayedImage(hat_uri, offsetXPercent,
						    offsetYPercent, widthPercent, heightPercent);
					} else {
						faceOverlay.setOverlayedImage("", 0, 0, 0, 0);
					}
				});

				calibrateButton.addEventListener("click", function(event){
					pointerDetector.trackColorFromCalibrationRegion();
				});

				yield webRtc.connect(mirror);
				yield mirror.connect(faceOverlay);
				yield faceOverlay.connect(pointerDetector);
				yield pointerDetector.connect(webRtc);
				yield pointerDetector.connect(recorder);
				yield recorder.record();

				var answer = yield webRtc.processOffer(offer);
				webRtcPeer.processSdpAnswer(answer);

				stopRecordButton.addEventListener("click", function(event){
					co(function*(){
						try{
							yield recorder.stop();
							yield pipeline.release();

							webRtcPeer.dispose();
							videoInput.src = "";
							videoOutput.src = "";
						}catch(e){
							console.error(e);
						}
					})();
				});
			} catch(e){
				console.error(e);
			}
		})();
	}
}


function startPlaying() {
	console.log("Start playing");

	var videoPlayer = document.getElementById("videoPlayer");
	var stopPlayButton = document.getElementById("stopPlayButton");
	var webRtcPeer = kurentoUtils.WebRtcPeer.startRecvOnly(videoPlayer,
			onPlayOffer, onError);

	function onPlayOffer(offer) {
		console.log("Local offer received ...")

		co(function*(){
			try{
				var client = yield kurentoClient(args.ws_uri);
				var pipeline = yield client.create("MediaPipeline");
				var webRtc = yield pipeline.create("WebRtcEndpoint");
				var answer = yield webRtc.processOffer(offer);

				webRtcPeer.processSdpAnswer(answer);

				var player = yield pipeline.create("PlayerEndpoint", {uri: args.file_uri});

				yield player.connect(webRtc);
				yield player.play();

				player.on("EndOfStream", function(event){
					pipeline.release();
					webRtcPeer.dispose();
					videoPlayer.src="";
				});

				stopPlayButton.addEventListener("click", function(event){
					pipeline.release();
					webRtcPeer.dispose();
					videoPlayer.src = "";
				});
			} catch(e){
				console.log(e);
			}
		})();
	}
}


function onError(error) {
	console.log(error);
}
