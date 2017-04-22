(function() {
	'use strict';

	angular.module('adjustorApp.controllers', [ 'fhcloud', 'ngCordova' ]);

	angular.module('adjustorApp.controllers').controller('ExistingClaimController', existingClaimController).controller('ClaimDetailController', claimDetailController).controller('AdjustClaimController', adjustClaimController);

	function existingClaimController($log, $timeout, $rootScope) {
		$log.info('Inside Adjuststor:ExistingClaimController');
		var vm = this;

		vm.loadClaimDetails = loadClaimDetails;

		function loadClaimDetails(claim) {
			$log.info(claim);
			if (claim) {
				$rootScope.claim = claim;
			}
		}

		function loadClaims() {
			feedhenry.cloud({
				path : '/v1/api/claim',
				method : 'GET',
				contentType : 'application/json'
			}, function(response) {
				$timeout(function() {
					vm.claims = response;
					vm.claimCount = 0;
					vm.claims.list.forEach(function(elt, i) {
						if (elt.fields.approved === null) {
							vm.claimCount++;
						}
					});
				});
			}, function(message, error) {
				$log.info(message);
				$log.error(error);
			});
		}

		loadClaims();

	}

	function claimDetailController($log, $location, $rootScope, $timeout, $ionicPlatform, $cordovaCamera, FHCObjectScrubber) {
		$log.info('Inside Adjuststor:ClaimDetailController');
		var vm = this;

		vm.hasClaim = false;
		vm.showAdjustedValue = false;
		vm.showUploadSpinner = false;
		var ready = false;

		vm.adjustValue = adjustValue;
		vm.approveClaim = approveClaim;
		vm.takePhoto = takePhoto;
		vm.updateClaim = updateClaim;
		vm.saveComment = saveComment;

		function adjustValue() {
			vm.showAdjustedValue = true;
		}

		function approveClaim() {
			if (vm.claim && vm.claim.fields) {
				vm.claim.fields.approved = true;
				updateClaim(vm.claim.fields);
			}
		}

		function loadClaim() {
			if ($rootScope.claim) {
				vm.claim = $rootScope.claim;
				if (vm.claim.fields.adjustedValue) {
					vm.showAdjustedValue = true;
				}
				vm.hasClaim = true;
			} else {
				$location.path('/');
			}
		}

		function takePhoto(source) {
			if (ready) {
				vm.showUploadSpinner = true;
				var options = {
					quality : 100,
					destinationType : 1,
					sourceType : source,
					encodingType : 0
				};
				$cordovaCamera.getPicture(options).then(function(imageData) {
					var imageUri = imageData;
					sendPhoto(imageUri);
					$cordovaCamera.cleanup(function() {
						$log.info('Cleanup Sucess');
					}, function() {
						$log.info('Cleanup Failure');
					});
				}, function(err) {
					$log.info('Error');
				});
			} else {
				$log.info('Not ready!');
			}
		}

		function sendPhoto(imageUri) {
			var url = $fh.getCloudURL();

			var options = new FileUploadOptions();
			options.fileKey = "file";
			options.fileName = imageUri.substr(imageUri.lastIndexOf('/') + 1);
			options.mimeType = "image/jpeg";

			var ft = new FileTransfer();
			ft.upload(imageUri, encodeURI(url + '/api/v1/bpms/upload-photo/' + vm.claim.fields.processId + '/' + options.fileName), function(success) {
				var response = success.response;
				var parsedResponse = JSON.parse(response.replace('\\', ''));
				var photo = {
					photoUrl : parsedResponse.photoLink,
					description : '',
					uploaderName : vm.claim.fields.id,
					uploadDate : new Date(),
					takenDate : ''
				}
				vm.claim.fields.photos.push(photo);
				updateClaim(vm.claim.fields);
				vm.showUploadSpinner = false;
			}, function(error) {
				vm.showUploadSpinner = false;
				$log.error(error);
			}, options);
		}

		function saveComment() {
			if (vm.comment) {
				feedhenry.cloud({
					path : '/api/v1/bpms/add-comments/' + vm.claim.fields.processId,
					method : 'POST',
					contentType : 'application/json',
					data : {
						claimComments : vm.comment,
						messageSource : 'adjuster'
					}
				});
				vm.claim.fields.comments.push({
					message : vm.comment,
					title : '',
					commenterName : '',
					commentDate : new Date()
				});
				vm.comment = '';
				updateClaim(vm.claim.fields);
			}
		}

		function updateClaim(claim) {
			if (claim) {
				// Clean out any angular $resource metadata
				FHCObjectScrubber.cleanObject(claim.questionnaires[0]);
				FHCObjectScrubber.cleanObject(claim.incident);
				// POST to the could endpoint
				feedhenry.cloud({
					path : '/v1/api/claim',
					method : 'PUT',
					contentType : 'application/json',
					data : claim
				}, function(response) {
					// Track the DB id for updates
					vm.claim.id = response.guid;
				}, function(message, error) {
					$log.info(message);
					$log.error(error);
				});
			}
		}

		loadClaim();

		$ionicPlatform.ready(function() {
			$log.info('ready');
			ready = true;
		});

	}

	function adjustClaimController($log, $timeout, $location, $rootScope, FHCObjectScrubber) {
		$log.info('Inside Adjuststor:AdjustClaimController');
		var vm = this;

		var task = {
			task_complete : false,
			task_adjustedAmount : '',
			task_approved : false,
			task_comment : ''
		};

		vm.adjust = adjust;
		vm.deny = deny;
		vm.incomplete = incomplete;
		vm.approve = approve;

		function adjust() {
			if (vm.adjustedValue) {
				task.task_adjustedAmount = parseFloat(vm.adjustedValue);
			}
			task.task_comment = vm.comment;
			feedhenry.cloud({
				path : '/api/v1/bpms/doadjuster/' + vm.claim.fields.processId,
				method : 'POST',
				contentType : 'application/json',
				data : task
			});
		}

		function approve() {
			task.task_complete = true;
			task.task_approved = true;
			vm.claim.fields.approved = true;
			vm.claim.fields.questionnaires[0].completedDate = new Date();
			vm.claim.fields.questionnaires[0].completedBy = 'tester';
			updateClaim(vm.claim.fields);
			adjust();
		}

		function deny() {
			task.task_complete = true;
			task.task_approved = false;
			vm.claim.fields.approved = false;
			vm.claim.fields.questionnaires[0].completedDate = new Date();
			vm.claim.fields.questionnaires[0].completedBy = 'tester';
			updateClaim(vm.claim.fields);
			adjust();
		}

		function incomplete() {
			task.task_complete = false;
			task.task_approved = false;
			adjust();
		}

		function loadClaim() {
			if ($rootScope.claim) {
				vm.claim = $rootScope.claim;
				if (vm.claim.fields.adjustedValue) {
					vm.showAdjustedValue = true;
				}
				vm.hasClaim = true;
			} else {
				$location.path('/');
			}
		}

		function updateClaim(claim) {
			if (claim) {
				// Clean out any angular $resource metadata
				FHCObjectScrubber.cleanObject(claim.questionnaires[0]);
				FHCObjectScrubber.cleanObject(claim.incident);
				// POST to the could endpoint
				feedhenry.cloud({
					path : '/v1/api/claim',
					method : 'PUT',
					contentType : 'application/json',
					data : claim
				}, function(response) {
					// Track the DB id for updates
					vm.claim.id = response.guid;
				}, function(message, error) {
					$log.info(message);
					$log.error(error);
				});
			}
		}

		loadClaim();

	}

})();
