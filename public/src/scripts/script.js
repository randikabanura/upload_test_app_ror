import GenerateMD5 from '../resources/spark-md5.js';

let clinetUploadStatus = {
  ready: "ready",
  uploading: "uploading",
  merging: "merging",
  uploadStopped: "upload_stopped",
  mergeStopped: "merge_stopped",
}

var Uploader = (function () {
  /**
   * Configurations
   */
  let VERSION = '1.0.0';
  var CLIENT_TYPE = ""
  var BASE_URL = "";
  let UPLOAD_INIT_ENDPOINT = "/upload/init";
  let UPLOAD_ENDPOINT = "/upload";
  let UPLOAD_STATUS_ENDPOINT = "/upload/status";
  let MAX_CHUNK_RETRY_COUNT = 5;
  let LOG_LEVEL = 'ALL';
  let MAX_CONCURRENT_CHUNK_UPLOADS = 5;
  var IS_CONNECTED = false;
  var CLIENT_UPLOAD_STATUS = "" //ready || uploading || merging

  /**
   * Global Variables 
   */
  var file = null;
  var fileInfo = {};
  var uploadInfo = {};
  var uncompleteUploadInfo = {};
  var fileChunks = [];
  var uploadStatusMsg = () => {};
  var uploadConnectionCount = 0;
  var regularCheckIsConnected = ""

  /**
  * 
  * Allow user to configure 
  */
  const config = (data) => {
    BASE_URL = data.baseURL;
    CLIENT_TYPE = data.client;
    MAX_CONCURRENT_CHUNK_UPLOADS = data['maxConcurrentUploads'] ? data['maxConcurrentUploads'] : MAX_CONCURRENT_CHUNK_UPLOADS;
    uploadStatusMsg = data.uploadStatusMsg;
    if (checkIsConnected()) {
      uploadStatusMsg({
        header: "Please Select a File",
        content: ""
      });
    }
  }

  /**
   * Return current configuration
   */
  const getConfig = () => {
    console.log("Base URL:" + BASE_URL);
    console.log("Client:" + CLIENT_TYPE);
    uploadStatusMsg({
      header: "test header",
      content: "test content"
    });
  }

  /**
   * Check uncomplete file details on local storage 
   */
  const checkLocalUncompleteUploads = () => {
    var uncompletes = readFromLocalStorage();
    return uncompletes;
  }

  /**
   * Check uncomplete file details on remote server 
   */
  const checkRemoteUncompleteUploads = (id) => {
    let data = { upload_id: id };
    uploadStatusReq(data, (isSessionAvailable, status) => {
      uncompleteUploadInfo = status;
    });
  }

  /**
   * Restart the uncomplete upload
   */
  const restartUpload = (selectedFile) => {
    file = selectedFile;
    console.log(uncompleteUploadInfo)
    uploadInfo["chunk_count"] = uncompleteUploadInfo["chunk_count"];
    uploadInfo["upload_id"] = uncompleteUploadInfo["upload_id"];
    let lastSuccessIndex = uncompleteUploadInfo["last_success_chunk_index"];
    splitFile((chunks) => {
      updateChunkArray(chunks, lastSuccessIndex, (finalChunkArray) => {
        fileChunks = finalChunkArray;
        console.log(finalChunkArray);
        uploadChunks();
      });
    });
  }

  /**
   * Update chunck array for restart 
   */
  const updateChunkArray = async (chunkArray, lastSuccessIndex, callback) => {
    let newArray = await chunkArray.map((chunk, index) => {
      if (index <= lastSuccessIndex) {
        chunk["uploadStatus"] = 1;
        return chunk;
      } else {
        return chunk;
      }
    });
    callback(newArray);
  }

  /**
   * Trigger on file selection
   */
  const initUpload = (selectedFile) => {
    uploadStatusMsg({
      header: "Check Compatibility",
      content: "Please wait."
    });
    //Check the cliend compatibility with HTML 5 File API
    if (window.File && window.FileReader && window.FileList && window.Blob) {
      file = selectedFile;
      checkServerCompatibility();
    } else {
      uploadStatusMsg({
        header: "Browser Incompatible",
        content: "The File Upload not supported by this browser."
      });
    }
  };

  /**
   * Check ther server compatibility
   */
  const checkServerCompatibility = () => {
    if (file != null) {
      generateHash(file, (hash) => {
        let fileType = file.name.split('.').pop();
        //FileType chnaged to fix the not merging issue in the server
        var data = {
          local_file_name: file.name,
          file_type: fileType,
          file_size: file.size / 1024, //Size needed in kilobytes 
          lfu_client_version: VERSION,
          lfu_client_type: CLIENT_TYPE,
          file_hash: hash
        }
        fileInfo = data;
        uploadInitReq(data, (isServerCompatible) => {
          if (isServerCompatible) {
            CLIENT_UPLOAD_STATUS = clinetUploadStatus.ready;
            uploadStatusMsg({
              header: "Ready to Upload",
              content: "Please start you upload."
            });
          } else {
            uploadStatusMsg({
              header: "Server Incompatible",
              content: "The File Upload not supported by the server."
            });
          }
        });
      });
    } else {
      uploadStatusMsg({
        header: "File not selected",
        content: "Please select a valid file."
      });
    }
  }

  /**
   * Start upload on button click
   */
  const startUpload = () => {
    if (file != null) {
      if (uploadInfo["upload_id"] && uploadInfo["chunk_count"]) {
        uploadStatusMsg({
          header: "Preparing to Uploading",
          content: "Please wait."
        });
        splitFile((chunks) => {
          fileChunks = chunks;
          console.log(chunks);
          uploadInfoPrepare((info) => {
            uploadStatusMsg({
              header: "Chunk Upload Started",
              content: "0%"
            });
            writeToLocalStorage(info);
            CLIENT_UPLOAD_STATUS = clinetUploadStatus.uploading;
            regularCheckIsConnected = setInterval(checkIsConnected, 5000);
            uploadChunks();
          });
        });
      }
    } else {
      uploadStatusMsg({
        header: "File not selected",
        content: "Please select a valid file."
      });
    }
  }

  /**
   * Split the file in to several chunks
   */
  const splitFile = async (splitDoneCallback) => {
    let chunksAmount = uploadInfo["chunk_count"]
    var byteIndex = 0;
    var chunks = [];
    var chunkSize = Math.ceil((file.size / chunksAmount));

    for (var i = 0; i < chunksAmount; i += 1) {
      var byteEnd = chunkSize * (i + 1);
      var slice = file.slice(byteIndex, byteEnd);

      await generateHash(slice, (hash) => {
        chunks.push({
          chunkData: slice,
          retryCount: 0,
          uploadStatus: 0,
          chunkHash: hash,
        });
      });

      byteIndex += (byteEnd - byteIndex);
    }
    splitDoneCallback(chunks);
  }

  /**
   * Generate hash for provided blob
   */
  const generateHash = (blob, hashDoneCallback) => {
    var generateMD5 = new GenerateMD5();
    var fileReader = new FileReader();
    var hash = ""

    const sequenceHashGeneration = function (resolve, reject) {
      fileReader.onload = function () {
        var arrayBuffer = new generateMD5.ArrayBuffer();
        var md5 = arrayBuffer.append(this.result);
        hash = arrayBuffer.end();
      };

      fileReader.onloadend = function () {
        resolve(hashDoneCallback(hash));
      }

      fileReader.readAsArrayBuffer(blob);
      return;
    }
    return new Promise(sequenceHashGeneration);
  }

  /**
  * Upload chunks one by one
  */
  const uploadChunks = () => {
    if (uploadConnectionCount >= MAX_CONCURRENT_CHUNK_UPLOADS) return;
    //find the next failed or upload not started chunk
    var curChunkIndex = -1;
    var curChunk;

    for (var i = 0; i < fileChunks.length; i++) {
      curChunk = fileChunks[i];
      if ((curChunk.uploadStatus == -1 && curChunk.retryCount <= MAX_CHUNK_RETRY_COUNT) || curChunk.uploadStatus == 0) {
        curChunkIndex = i
        break;
      }
    }

    if (curChunkIndex < 0) {
      logger.debug("[uploadChunks] No chunks available to upload");
      return;
    }

    if (!IS_CONNECTED) {
      CLIENT_UPLOAD_STATUS = clinetUploadStatus.uploadStopped;
      logger.debug("[uploadChunks] No Internet Connection");
      return;
    }

    logger.debug(`[uploadChunks] Chunk at index:${curChunkIndex} is available for upload`);
    curChunk.uploadStatus = 2
    if (curChunk.uploadStatus != 1) {
      let data = {
        queryParams: {
          upload_id: uploadInfo["upload_id"],
          chunk_index: curChunkIndex.toString(),
          chunk_hash: curChunk.chunkHash.toString(),
          retry_count: curChunk.retryCount.toString(),
        },
        chunkData: curChunk.chunkData
      }
      logger.debug(`[uploadChunks] Started uploading chunk at index:${curChunkIndex}`);
      uploadChunkReq(data, function (isSuccess, respond) {
        if (isSuccess) {
          curChunk.uploadStatus = 1;
          logger.debug(`[uploadChunks] Upload success for chunk at index:${curChunkIndex}`);
          uploadStatusMsg({
            header: "Chunk Uploading",
            content: respond["upload_progress"] + "%"
          });

          if (respond["upload_progress"] == 100) {
            startListenToMergeProgress();
          }

        }
        else {
          curChunk.uploadStatus = -1;
          curChunk.retryCount += 1;
          logger.debug(`[uploadChunks] Upload failed for chunk at index: ${curChunkIndex}, retry count: ${curChunk.retryCount}`);
          uploadStatusMsg({
            header: "Chunk Upload Failed",
            content: `Upload failed for chunk at index: ${curChunkIndex}`
          });
        }
        uploadChunks();
      });
    }
    uploadChunks();
  }

  const startListenToMergeProgress = () => {
    let uplodId = uploadInfo["upload_id"]
    let data = { upload_id: uplodId };

    uploadStatusMsg({
      header: "Chunk Merging Started",
      content: "Please wait."
    });

    const checkMergeProgress = setInterval(() => {
      if (!IS_CONNECTED) {
        CLIENT_UPLOAD_STATUS = clinetUploadStatus.mergeStopped;
        clearInterval(regularCheckIsConnected);
        logger.debug("[mergeChunks] No Internet Connection");
        return;
      }

      uploadStatusReq(data, (isSuccess, data) => {
        if (isSuccess) {
          var mergeProgress = data["merge_progress"];
          if (mergeProgress == 100) {
            clearInterval(checkMergeProgress);
            uploadStatusMsg({
              header: "Chunk Merge Completed, File Upload Successful",
              content: `${mergeProgress}%`
            });
            removeFromLocalStorage(uplodId);
            clearInterval(regularCheckIsConnected);
          } else {
            uploadStatusMsg({
              header: "Chunk Merging in the Server",
              content: `${mergeProgress}%`
            });
          }
        } else {
          clearInterval(regularCheckIsConnected);
          uploadStatusMsg({
            header: "Chunk Merge Failed",
            content: `Something went bad in the server. Please try again later.`
          });
        }
      });
    }, 5000);
  }

  /**
   * Read & write to storage
   */
  const writeToLocalStorage = (info) => {
    let lclStrg = localStorage.getItem("fz-lfu");
    var tempLocalData = lclStrg != null ? JSON.parse(lclStrg) : [];

    let newArrayLenght = tempLocalData.unshift(info);
    if (newArrayLenght <= 3) {
      localStorage.setItem("fz-lfu", JSON.stringify(tempLocalData));
    } else {
      let slicedArray = tempLocalData.slice(0, 3);
      localStorage.setItem("fz-lfu", JSON.stringify(slicedArray));
    }
  }

  const readFromLocalStorage = () => {
    let lclStrg = localStorage.getItem("fz-lfu");
    if (lclStrg != null) {
      return JSON.parse(lclStrg);
    } else {
      return [];
    }
  }

  const removeFromLocalStorage = async (uploadId) => {
    let lclStrg = localStorage.getItem("fz-lfu");
    var tempLocalData = lclStrg != null ? JSON.parse(lclStrg) : [];

    var toDeleteIndex = -1;
    var toDelete = await tempLocalData.find((record) => {
      if (record.uploadId == uploadId) {
        toDeleteIndex = tempLocalData.indexOf(record);
        return record;
      }
    });

    if (toDeleteIndex != -1) {
      tempLocalData.splice(toDeleteIndex, 1);
      localStorage.setItem("fz-lfu", JSON.stringify(tempLocalData));
    }
  }

  /**
   * API Requests
   */
  /**
   * Init upload process setup the session
   */
  const uploadInitReq = (data, doneCallback) => {
    let request = new XMLHttpRequest();
    let queryString = toQueryStringParams(data);
    let path = BASE_URL + UPLOAD_INIT_ENDPOINT + `?${queryString}`;

    request.open('GET', path);
    request.responseType = 'json';
    request.send();

    request.onload = function () {
      console.log(request.response);
      if (request.status == 200) {
        uploadInfo = request.response["data"];
        doneCallback(true);
      } else {
        console.log(`Error Occured: ${request.status} `);
        doneCallback(false);
      }
    };

    request.onerror = function () {
      console.log(`Network Error`);
    };
  }

  /**
  * Upload chunk
  */
  const uploadChunkReq = (data, doneCallback) => {
    uploadConnectionCount++;
    let request = new XMLHttpRequest();
    console.log(data.queryParams);
    let queryString = toQueryStringParams(data.queryParams);
    let path = BASE_URL + UPLOAD_ENDPOINT + `?${queryString}`;
    let formData = new FormData();

    request.open('POST', path);
    request.responseType = 'json';
    formData.append("file", data.chunkData);
    request.send(formData);

    request.onload = function () {
      uploadConnectionCount--;
      logger.debug(request);
      logger.debug(`Loaded: ${request.status} ${request.response["success"]}`);
      logger.debug(request.response["data"]);
      if (request.status == 200) {
        doneCallback(true, request.response["data"])
      } else {
        logger.error(`Error Occured: ${request.status} `);
        doneCallback(false);
      }
    };

    request.onerror = function () {
      uploadConnectionCount--;
      logger.error(`Network Error`);
      doneCallback(false);
    };
  }

  /**
  * Get upload status
  */
  const uploadStatusReq = (data, doneCallback) => {
    let request = new XMLHttpRequest();
    let queryString = toQueryStringParams(data);
    let path = BASE_URL + UPLOAD_STATUS_ENDPOINT + `?${queryString}`;

    request.open('GET', path);
    request.responseType = 'json';
    request.send();

    request.onload = function () {
      console.log(request.response);
      let reqCode = request.status;
      if (reqCode == 200 || reqCode == 202 || reqCode == 206) {
        doneCallback(true, request.response["data"]);
      } else {
        console.log(`Error Occured: ${request.status} `);
        doneCallback(false);
      }
    };

    request.onerror = function () {
      console.log(`Network Error`);
    };
  }

  /**
   * Utils
   */
  const toQueryStringParams = params => {
    const queryArr = Object.keys(params).map(key =>
      params[key] !== 0 && params[key] !== "" ? key + "=" + params[key] : ""
    );

    var queryString = queryArr
      .filter(function (arr) {
        return arr !== "";
      })
      .join("&");

    return queryString;
  };

  const checkIsConnected = () => {
    var ifConnected = window.navigator.onLine;
    console.log("Internet Connetion availability : " + ifConnected);

    if (ifConnected) {
      if (!IS_CONNECTED && CLIENT_UPLOAD_STATUS === clinetUploadStatus.uploadStopped) {
        IS_CONNECTED = ifConnected;
        uploadStatusMsg({
          header: "Connected To the Internet",
          content: "Continuing Upload"
        });
        uploadChunks();
      } else if (!IS_CONNECTED && CLIENT_UPLOAD_STATUS === clinetUploadStatus.mergeStopped) {
        IS_CONNECTED = ifConnected;
        uploadStatusMsg({
          header: "Connected To the Internet",
          content: "Updating Merge Status"
        });
        startListenToMergeProgress();
      } else if (!IS_CONNECTED && (CLIENT_UPLOAD_STATUS === clinetUploadStatus.merging || CLIENT_UPLOAD_STATUS === clinetUploadStatus.uploading)) {
        IS_CONNECTED = ifConnected;
        uploadStatusMsg({
          header: "Connected To the Internet",
          content: `Continuing ${CLIENT_UPLOAD_STATUS}`
        });
      } else {
        IS_CONNECTED = ifConnected;
      }
    } else {
      IS_CONNECTED = ifConnected;
      uploadStatusMsg({
        header: "No Internet Connection",
        content: "Please check your internet connection."
      });
    }
    return ifConnected;
  };

  const uploadInfoPrepare = async (callback) => {
    await generateHash(file, (hash) => {
      let fileDetails = uploadInfo["file_details"];
      var info = new LocalUploadInfo(
        uploadInfo["upload_id"],
        fileDetails["local_file_name"],
        fileDetails["file_type"],
        fileDetails["file_size"],
        uploadInfo["chunk_count"],
        hash
      );

      callback(info);
    });
  }

  class LocalUploadInfo {
    constructor(uploadId, fileName, fileType, fileSize, chunkCount, hash) {
      this.uploadId = uploadId;
      this.fileName = fileName;
      this.fileType = fileType;
      this.fileSize = fileSize;
      this.chunkCount = chunkCount;
      this.hash = hash;
    }
  }

  /**
   * Print log in console
   */
  const logger = {
    debug: function (logData) {
      if (LOG_LEVEL == 'ALL' || LOG_LEVEL == 'DEBUG')
        console.log(logData)
    },
    error: function (logData) {
      if (LOG_LEVEL == 'ALL' || LOG_LEVEL == 'ERROR')
        console.error(logData)
    },
    trace: function (logData) {
      if (LOG_LEVEL == 'ALL' || LOG_LEVEL == 'TRACE')
        console.info(logData)
    }
  }

  /**
   * Expose public methods to user
   */
  return {
    config: function (data) {
      return config(data);
    },
    getConfig: function () {
      return getConfig();
    },
    initUpload: function (selectedFile) {
      return initUpload(selectedFile)
    },
    startUpload: function () {
      return startUpload();
    },
    checkLocalUncompleteUploads: function () {
      return checkLocalUncompleteUploads();
    },
    checkRemoteUncompleteUploads: function (id) {
      return checkRemoteUncompleteUploads(id);
    },
    restartUpload: function (selectedFile) {
      return restartUpload(selectedFile);
    },
    unitTest: {
      config : config,
      toQueryStringParams : toQueryStringParams,
      checkIsConnected : checkIsConnected,
      getData : () => { return {
        VERSION : VERSION,
        CLIENT_TYPE : CLIENT_TYPE,
        BASE_URL : BASE_URL,
        MAX_CHUNK_RETRY_COUNT : MAX_CHUNK_RETRY_COUNT,
        MAX_CONCURRENT_CHUNK_UPLOADS : MAX_CONCURRENT_CHUNK_UPLOADS,
        IS_CONNECTED : IS_CONNECTED,
        CLIENT_UPLOAD_STATUS : CLIENT_UPLOAD_STATUS,
        file : file,
        fileInfo : fileInfo,
        uploadInfo : uploadInfo,
        uncompleteUploadInfo : uncompleteUploadInfo,
        fileChunks : fileChunks,
        uploadConnectionCount : uploadConnectionCount,
      }}
    },
  }
});

export default Uploader;