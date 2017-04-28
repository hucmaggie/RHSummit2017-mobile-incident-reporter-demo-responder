(function() {
	'use strict';

	angular.module('adjustorApp.controllers', [ 'fhcloud', 'ngCordova' ]);

	angular.module('adjustorApp.controllers').controller('ExistingClaimController', existingClaimController).controller('ClaimDetailController', claimDetailController).controller('AdjustClaimController', adjustClaimController);

	function existingClaimController($log, $timeout, $rootScope) {

	    $log.info('Inside Adjuststor:existingClaimController');
		var vm = this;

		vm.loadClaimDetails = loadClaimDetails;

		function loadClaimDetails(claim) {

            $log.info("Inside existingClaimController:loadClaimDetails");
			$log.info("Found claim: ", claim);
			if (claim) {
				$rootScope.claim = claim;
			}
		}

		function loadClaims() {

            $log.info("Inside existingClaimController:loadClaims");

			feedhenry.cloud({
				path : '/v1/api/claims',
				method : 'GET',
				contentType : 'application/json'
			}, function(response) {
				$timeout(function() {
                    $log.info("got Claims: ", response);

					vm.claims = response;
					vm.claimCount = 0;

                    if (vm.claims != null || vm.claims != undefined) {

                        vm.claims.forEach(function (claim) {

                            vm.claimCount++;

                            // lets fix the photos
                            if (claim.incidentPhotoIds && claim.incidentPhotoIds.length > 0){
                                claim.photos = [];
                                claim.incidentPhotoIds.forEach(function(p, i) {

                                    var link = 'http://services-incident-demo.apps.ocp.hucmaggie.com/photos/' + claim.processId + '/' + p.replace(/'/g, '');
                                    claim.photos.push(link);
                                    $log.info("photo link: ", link);
                                });
                            }

                            // lets fix the comments
                            if (claim.incidentComments && claim.incidentComments.length > 0){
                                claim.comments = [];
                                claim.incidentComments.forEach(function(c, i) {

                                    claim.comments.push({message: c});

                                    //$log.info("comment message: ", c);
                                });
                            }

                        });

                        $log.info("found " + vm.claimCount + " existing Claim(s)");
                    }
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
            $log.info('Inside claimDetailController:approveClaim');

			if (vm.claim && vm.claim.processId) {
				vm.claim.approved = true;
				updateClaim(vm.claim);
			}
		}

		function loadClaim() {

            $log.info('Inside claimDetailController:loadClaim');

			if ($rootScope.claim) {
				vm.claim = $rootScope.claim;
				if (vm.claim.adjustedValue) {
					vm.showAdjustedValue = true;
				}
				vm.hasClaim = true;
			} else {
				$location.path('/');
			}
		}

		function takePhoto(source) {

            $log.info('Inside takePhoto');
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

            $log.info('Inside sendPhoto');

			var url = $fh.getCloudURL();

			var options = new FileUploadOptions();
			options.fileKey = "file";
			options.fileName = imageUri.substr(imageUri.lastIndexOf('/') + 1);
			options.mimeType = "image/jpeg";

			var ft = new FileTransfer();
			ft.upload(imageUri, encodeURI(url + '/api/v1/bpms/upload-photo/' + vm.claim.processId + '/' + options.fileName), function(success) {

                var link = success.link;
                //incidentPhotoIds
                vm.claim.photos.push(link);

				// var response = success.response;
				// var parsedResponse = JSON.parse(response.replace('\\', ''));
				// var photo = {
				// 	photoUrl : parsedResponse.photoLink,
				// 	description : '',
				// 	uploaderName : vm.claim.fields.id,
				// 	uploadDate : new Date(),
				// 	takenDate : ''
				// }
				//vm.claim.fields.photos.push(photo);
				//updateClaim(vm.claim.fields);
				vm.showUploadSpinner = false;
			}, function(error) {
				vm.showUploadSpinner = false;
				$log.error(error);
			}, options);
		}

		function saveComment() {

            $log.info('Inside saveComment');

			if (vm.comment) {
				feedhenry.cloud({
					path : '/api/v1/bpms/add-comments/' + vm.claim.processId,
					method : 'POST',
					contentType : 'application/json',
					data : {
						claimComments : vm.comment,
						messageSource : 'responder'
					}
				});

                $log.info("done saving Comment: ", vm.comment);

                //incidentComments
				vm.claim.comments.push({
					message : vm.comment,
					title : '',
					commenterName : '',
					commentDate : new Date()
				});
				vm.comment = '';
				//updateClaim(vm.claim);
			}
		}

		function updateClaim(claim) {

            $log.info('Inside updateClaim');

			if (claim) {
				// Clean out any angular $resource metadata
				FHCObjectScrubber.cleanObject(claim.questionnaire);
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

            $log.info('Inside adjustClaimController:adjust');

			if (vm.adjustedValue) {
				task.task_adjustedAmount = parseFloat(vm.adjustedValue);
			}
			task.task_comment = vm.comment;
			feedhenry.cloud({
				path : '/api/v1/bpms/doadjuster/' + vm.claim.processId,
				method : 'POST',
				contentType : 'application/json',
				data : task
			});
		}

		function approve() {
            $log.info('Inside adjustClaimController:approve');

			task.task_complete = true;
			task.task_approved = true;
			vm.claim.approved = true;
			vm.claim.questionnaire.completedDate = new Date();
			vm.claim.questionnaire.completedBy = 'tester';
			updateClaim(vm.claim);
			adjust();
		}

		function deny() {
            $log.info('Inside adjustClaimController:deny');
			task.task_complete = true;
			task.task_approved = false;
			vm.claim.approved = false;
			vm.claim.questionnaire.completedDate = new Date();
			vm.claim.questionnaire.completedBy = 'tester';
			updateClaim(vm.claim);
			adjust();
		}

		function incomplete() {
			task.task_complete = false;
			task.task_approved = false;
			adjust();
		}

		function loadClaim() {
            $log.info('Inside adjustClaimController:loadClaim');
			if ($rootScope.claim) {
				vm.claim = $rootScope.claim;
				if (vm.claim.adjustedValue) {
					vm.showAdjustedValue = true;
				}
				vm.hasClaim = true;
			} else {
				$location.path('/');
			}
		}

		function updateClaim(claim) {

            $log.info('Inside adjustClaimController:updateClaim');
			if (claim) {
				// Clean out any angular $resource metadata
				FHCObjectScrubber.cleanObject(claim.questionnaire);
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
