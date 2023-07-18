import * as core from '@actions/core'
import {google, drive_v3} from 'googleapis'

import {syncToGoogleDrive} from './gdrive'
import {ZoomFile, authenticate, getRecordings, downloadMeetings} from './zoom'

function getDateRange(): [string, string] {
  const lookbackDays = Number(core.getInput('lookback-days') || 7)
  const endDate = new Date(core.getInput('end-date') || Date.now())

  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - lookbackDays)

  const start = startDate.toISOString().split('T')[0]
  const end = endDate.toISOString().split('T')[0]

  return [start, end]
}

async function downloadRecordings(): Promise<[ZoomFile[], number]> {
  const account = core.getInput('zoom-account-id')
  const client = core.getInput('zoom-client-id')
  const clientSecret = core.getInput('zoom-client-secret')
  const [from, to] = getDateRange()

  await authenticate(account, client, clientSecret)

  const {meetings} = await getRecordings('me', from, to)

  return await downloadMeetings(meetings)
}

async function authAndSyncToGoogleDrive(
  files: ZoomFile[],
  total_size: number
): Promise<drive_v3.Schema$File[]> {
  const credentials = Buffer.from(core.getInput('gsa-credentials'), 'base64').toString(
    'utf-8'
  )

  const folderMap = JSON.parse(core.getInput('meeting-gdrive-folder-map'))

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credentials),
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  const drive = google.drive({version: 'v3', auth})
  return await syncToGoogleDrive(drive, files, total_size, folderMap)
}

async function run(): Promise<void> {
  try {
    const [files, total_size] = await downloadRecordings()
    await authAndSyncToGoogleDrive(files, total_size)

    core.setOutput('recordings', files)
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}

run()
