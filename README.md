# wikiGDrive

The complete spec is here:
https://docs.google.com/document/d/1H6vwfQXIexdg4ldfaoPUjhOZPnSkNn6h29WD6Fi-SBY/edit#

You will need a google account to see the shared drive since google does not seem to allow publish shared drives. Just ask for access when getting access to the drive. 

Snippet
========


Overview
Develop a node.js script that will use the Google Drive api  (https://developers.google.com/drive/api/v3/quickstart/nodejs) 

With a "Shared Drive" as the key:
Read all the files from a Google "Shared Drive"
Build a map of the driveId (URL) to the path name in the "Shared Drive"
For each Google Document:
Convert to a Markdown file with the path (instead of the driveId for the file)
Change driveId to the path  (eg:  12lvdxKgGsD.../edit would be changed to /filename
Support diagrams as SVG (and map the URLs in the diagram)

The script should scan for changes in the drive and then refresh the local converted files.



The node.js script should refresh the "Local Filesystem" with changes from the Google Shared Drive overwriting or deleting any content to bring it into sync.  The Local Filesystem is not preserved (since we will be committing the markdown in github anyway).






https://developers.google.com/drive/api/v3/quickstart/nodejs

1. Create Project
2. Add Google Drive API
3. Add Google Docs API
4. Credentials ->  Create Credentials (OAuth Client ID) -> Other
5. Put credentials into .wikigdrive
