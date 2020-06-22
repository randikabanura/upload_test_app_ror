import Uploader from "./script";

var fileUploader = null;
var unitTest = {};

beforeEach(() => {
  fileUploader = new Uploader();
  unitTest = fileUploader.unitTest;
});

afterEach(() => {
  fileUploader = null;
  unitTest = {};
});

test("should config uploader", async () => {
  let baseURL = "http://54.145.169.34:8080/v1";
  let client = "Web";
  let maxConcurrentUploads = 4;
  let uploadStatusMsg = function (message) {
    console.log(message);
  };

  await unitTest.config({
    baseURL: baseURL,
    client: client,
    maxConcurrentUploads: maxConcurrentUploads,
    uploadStatusMsg: uploadStatusMsg,
  });

  var variableData = await unitTest.getData();

  expect(variableData.BASE_URL).toBe(baseURL);
  expect(variableData.MAX_CONCURRENT_CHUNK_UPLOADS).toBe(maxConcurrentUploads);
});

test("should connected to internet", async () => {
  expect(unitTest.checkIsConnected()).toBeTruthy();
});

test("should convert object to query string", async () => {
  let input = {
    test: "test",
    zero: 0,
    one: "one",
    two: 2,
    empty: "",
  };
  let output = "test=test&one=one&two=2";
  expect(unitTest.toQueryStringParams(input)).toEqual(output);
});
