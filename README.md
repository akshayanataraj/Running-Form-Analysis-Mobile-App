# Running-Form-Analysis-Mobile-App
This is a mobile app created using react native, javascript and python which is used to determine the running form of a person in an uploaded video.
Requirements
  1.	Node.js and NPM
  2.	Python
  3.	Terminal commands for package installations:

    a.	Python Requirements
      i.	OpenCV - pip install opencv-python
      ii.	Mediapipe pose detection model – pip install mediapipe
      iii.	Numpy – pip install numpy
      iv.	Flask – pip install flask
    b.	React Native Requirements
      i.	Expo image picker – npx expo install expo-image-picker
      ii.	Expo av – npx expo install expo-av
      iii.	Axios - npm i react-native-axios
      iv.	SVG - npm i react-native-svg

Run this command in terminal to initialize a react native project file

  -	expo init app-name

NOTE: choose blank template to create react environment in javascript

App.js consists of the react native code which is the frontend to be displayed on the app. 
pose_detection.py consists of the python backend code which involves video processing and detection.
Both above are connected using a Flask API server initialized by the backend and called to the fronted using Axios. Python file is run first then followed by React Native. The server URL will be shown in terminal after running the python file. Terminal command to run:
  -	python pose_detection.py
  -	npx expo start


