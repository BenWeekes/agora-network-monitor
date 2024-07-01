
## AgoraRTCNetEx.js
This javascript module provides an 'Out of band' bandwidth adaptation algorithm to work alongside the AgoraRTC 4.x SDK.
It can produce better results than the standard webrtc alogirthm which can be oversensitive for some real-time engagement applications. 

#### Include the javascript:

         <script src="./AgoraRTCNetEx.js"></script>
                
#### Call the method 

Before publishing your video to the channel, call the optimizeNetworkControl() method.         
Pass in the min and max bit rates that you wish the high stream encoder to move between and which match those of your selected profile.     
  
## Function arguments      

<pre>

AgoraRTCNetEx.optimizeNetworkControl(client, rtm_appid, rtm_token, br_min, br_max);

client         The AgoraRTC client object returned from createClient method.     
rtm_appid      The RTM AppId to connect into an RTM channel.     
rtm_token      The RTM token to connect into an RTM channel (if tokens are enabled for this appid otherwise pass null)       
br_min         The lowest bitrate a client will encode at. Below this subscribers could move to a low stream alternative.       
br_max         The highest bitrate a client will encode at. Below this subscribers could move to a low stream alternative.       
</pre>


#### Web Demo
https://sa-utils.agora.io/agora-netex/index.html

#### Demo Videos

Mac - Mac
https://drive.google.com/file/d/1KQ2kqxnAGQdyVxYBc7jX5khIwyF7vMqw/view?usp=sharing


Mac - iOS 
https://drive.google.com/file/d/10TJpSpex5E_baM26rqxnb1d9alIyA7lS/view?usp=sharing


#### Further enhancements   
Test further when more than 2 hosts publishing in channel.      
Switch subscriber to low stream if inbound bitrate below br_min.    
# agora-network-monitor
